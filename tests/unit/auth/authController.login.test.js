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
    refreshSession: jest.fn(),
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
const { startSession, endSession, refreshSession } =
    await import("../../../src/modules/auth/services/sessionActivity.js");
const { login, logout, reportSessionActivity, showLogin, showLoginLocked } =
    await import("../../../src/modules/auth/controllers/authController.js");

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
        refreshSession.mockResolvedValue(true);
        req = { body: { email: "patient@example.com", password: "CorrectPassword123!" } };
        res = {
            cookie: jest.fn(),
            clearCookie: jest.fn(),
            redirect: jest.fn(),
            status: jest.fn().mockReturnThis(),
            sendStatus: jest.fn().mockReturnThis(),
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

    test("enables the splash only when opening the login page", () => {
        showLogin({ query: {} }, res);

        expect(res.render).toHaveBeenCalledWith(
            "auth/login",
            expect.objectContaining({ showLoginSplash: true }),
        );
    });

    test("keeps the splash disabled on the locked login page", () => {
        showLoginLocked({}, res, new Date(Date.now() + 60_000));

        expect(res.render).toHaveBeenCalledWith(
            "auth/login",
            expect.objectContaining({ showLoginSplash: false }),
        );
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

    test("logout ends the session without changing failed login state", async () => {
        req.auth = { sessionId: "existing-session" };

        await logout(req, res, next);

        expect(endSession).toHaveBeenCalledWith("existing-session");
        expect(clearLoginFailures).not.toHaveBeenCalled();
        expect(res.redirect).toHaveBeenCalledWith(303, "/login");
    });

    test("does not report successful logout when session revocation fails", async () => {
        req.auth = { sessionId: "existing-session" };
        const error = new Error("Database unavailable");
        endSession.mockRejectedValue(error);

        await logout(req, res, next);

        expect(res.redirect).not.toHaveBeenCalled();
        expect(res.clearCookie).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(error);
    });

    test("renews an active session after qualifying browser activity", async () => {
        req.auth = { sessionId: "active-session", userId: "15" };
        refreshSession.mockResolvedValue(true);

        await reportSessionActivity(req, res, next);

        expect(refreshSession).toHaveBeenCalledWith("active-session", "15");
        expect(res.sendStatus).toHaveBeenCalledWith(204);
        expect(res.clearCookie).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test("clears the cookie when activity arrives after the session expires", async () => {
        req.auth = { sessionId: "expired-session", userId: "15" };
        refreshSession.mockResolvedValue(false);

        await reportSessionActivity(req, res, next);

        expect(res.sendStatus).toHaveBeenCalledWith(401);
        expect(res.clearCookie).toHaveBeenCalledWith(
            "token",
            expect.objectContaining({ httpOnly: true, path: "/" }),
        );
        expect(next).not.toHaveBeenCalled();
    });

    test("forwards activity persistence failures to Express", async () => {
        const error = new Error("Database unavailable");
        refreshSession.mockRejectedValue(error);

        await reportSessionActivity({ auth: { sessionId: "session", userId: "15" } }, res, next);

        expect(next).toHaveBeenCalledWith(error);
        expect(res.sendStatus).not.toHaveBeenCalled();
    });
});
