import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("jsonwebtoken", () => ({
    default: { sign: jest.fn(() => "signed-token") },
}));

jest.unstable_mockModule("../../../config/environment.js", () => ({
    default: {
        jwt: { secret: "test-secret", expiresIn: "15m" },
        nodeEnv: "test",
    },
}));

jest.unstable_mockModule("../../../src/modules/auth/services/authService.js", () => ({
    authenticateUser: jest.fn(),
    clearLoginFailures: jest.fn(),
    AuthenticationError: class AuthenticationError extends Error {},
    LoginTemporarilyLockedError: class LoginTemporarilyLockedError extends Error {
        constructor(lockedUntil) {
            super("login locked");
            this.lockedUntil = lockedUntil;
        }
    },
    EmailVerificationRequiredError: class EmailVerificationRequiredError extends Error {},
}));

jest.unstable_mockModule("../../../src/modules/auth/services/sessionActivity.js", () => ({
    startSession: jest.fn(),
    endSession: jest.fn(),
}));

jest.unstable_mockModule("../../../src/modules/auth/services/emailVerificationService.js", () => ({
    verifyEmail: jest.fn(),
}));

jest.unstable_mockModule("../../../src/modules/auth/services/registrationService.js", () => ({
    registerPatient: jest.fn(),
    RegistrationError: class RegistrationError extends Error {},
}));

jest.unstable_mockModule("../../../src/modules/auth/services/passwordResetService.js", () => ({
    requestPasswordReset: jest.fn(),
    resetPassword: jest.fn(),
}));

const { authenticateUser, clearLoginFailures, AuthenticationError, LoginTemporarilyLockedError } =
    await import("../../../src/modules/auth/services/authService.js");
const { startSession, endSession } =
    await import("../../../src/modules/auth/services/sessionActivity.js");
const { login, logout } = await import("../../../src/modules/auth/controllers/authController.js");

describe("Authentication controller", () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
        jest.clearAllMocks();
        authenticateUser.mockResolvedValue({
            id: 15,
            email: "patient@example.com",
            role: "Patient",
        });
        clearLoginFailures.mockResolvedValue(undefined);
        req = { body: { email: "patient@example.com", password: "CorrectPassword123!" } };
        res = {
            cookie: jest.fn(),
            clearCookie: jest.fn(),
            redirect: jest.fn(),
            status: jest.fn().mockReturnThis(),
            render: jest.fn().mockReturnThis(),
            set: jest.fn(),
        };
        next = jest.fn();
    });

    test("clears lockout state after a login session is started", async () => {
        await login(req, res, next);

        expect(startSession).toHaveBeenCalledWith(expect.any(String), 15);
        expect(clearLoginFailures).toHaveBeenCalledWith(15);
        expect(startSession.mock.invocationCallOrder[0]).toBeLessThan(
            clearLoginFailures.mock.invocationCallOrder[0],
        );
        expect(res.cookie).toHaveBeenCalledWith(
            "token",
            "signed-token",
            expect.objectContaining({ httpOnly: true }),
        );
        expect(res.redirect).toHaveBeenCalledWith(303, "/patient/dashboard");
        expect(next).not.toHaveBeenCalled();
    });

    test("does not clear lockout state when credentials are invalid", async () => {
        authenticateUser.mockRejectedValue(new AuthenticationError());

        await login(req, res, next);

        expect(clearLoginFailures).not.toHaveBeenCalled();
        expect(startSession).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });

    test("renders the lock expiry and does not start an authenticated session", async () => {
        const lockedUntil = new Date(Date.now() + 60_000);
        authenticateUser.mockRejectedValue(new LoginTemporarilyLockedError(lockedUntil));

        await login(req, res, next);

        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.render).toHaveBeenCalledWith(
            "auth/login",
            expect.objectContaining({ loginLockedUntil: lockedUntil.getTime() }),
        );
        expect(res.set).toHaveBeenCalledWith("Cache-Control", "no-store");
        expect(startSession).not.toHaveBeenCalled();
        expect(res.cookie).not.toHaveBeenCalled();
    });

    test("removes the session when clearing lockout state fails", async () => {
        clearLoginFailures.mockRejectedValue(new Error("Database unavailable"));

        await login(req, res, next);

        expect(endSession).toHaveBeenCalledWith(expect.any(String));
        expect(res.cookie).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(
            expect.objectContaining({ message: "Database unavailable" }),
        );
    });

    test("logout ends the session without changing failed login state", () => {
        req.auth = { sessionId: "existing-session" };

        logout(req, res);

        expect(endSession).toHaveBeenCalledWith("existing-session");
        expect(clearLoginFailures).not.toHaveBeenCalled();
        expect(res.redirect).toHaveBeenCalledWith(303, "/login");
    });
});
