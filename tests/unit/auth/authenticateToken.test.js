import { jest } from "@jest/globals";

// Mock JWT verification to test authentication without generating real tokens.
jest.unstable_mockModule("jsonwebtoken", () => ({
    default: {
        verify: jest.fn(),
    },
}));

// Provide predictable authentication settings for the tests.
jest.unstable_mockModule("../../../config/environment.js", () => ({
    default: {
        nodeEnv: "test",
        jwt: {
            secret: "test-secret",
            expiresIn: "15m",
        },
    },
}));

// Mock Sequelize models to test account status and current roles.
jest.unstable_mockModule("../../../src/models/associations.js", () => ({
    Rol: {},
    User: {
        findByPk: jest.fn(),
    },
}));

const jwt = (await import("jsonwebtoken")).default;
const { User } = await import("../../../src/models/associations.js");

// Mock session tracking to isolate middleware tests.
jest.unstable_mockModule("../../../src/modules/auth/services/sessionActivity.js", () => ({
    isSessionExpired: jest.fn(() => false),
    refreshSession: jest.fn(() => true),
    startSession: jest.fn(),
    endSession: jest.fn(),
}));

const { authenticateToken, requireRole } =
    await import("../../../src/middleware/authenticateToken.js");

const { isSessionExpired, refreshSession } =
    await import("../../../src/modules/auth/services/sessionActivity.js");

// Create reusable Express request and response mocks.
function createMocks(token = undefined) {
    const req = {
        cookies: token ? { token } : {},
    };

    const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
        redirect: jest.fn().mockReturnThis(),
        clearCookie: jest.fn().mockReturnThis(),
    };

    const next = jest.fn();

    return { req, res, next };
}

describe("authenticateToken middleware", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        isSessionExpired.mockReturnValue(false);
        refreshSession.mockReturnValue(true);
    });

    test("redirects to login when the authentication cookie is missing", async () => {
        const { req, res, next } = createMocks();

        await authenticateToken(req, res, next);

        expect(res.redirect).toHaveBeenCalledWith(303, "/login");
        expect(jwt.verify).not.toHaveBeenCalled();
        expect(User.findByPk).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test("accepts a valid token and attaches the current database identity", async () => {
        const { req, res, next } = createMocks("valid-token");

        jwt.verify.mockReturnValue({
            sub: "12",
            role: "Patient",
            sid: "test-session",
        });

        User.findByPk.mockResolvedValue({
            id: 12,
            is_active: true,
            rol: { name: "Patient" },
        });

        await authenticateToken(req, res, next);

        expect(jwt.verify).toHaveBeenCalledWith("valid-token", "test-secret", {
            algorithms: ["HS256"],
        });
        expect(User.findByPk).toHaveBeenCalledWith(
            "12",
            expect.objectContaining({
                where: { is_active: true },
            }),
        );
        expect(req.auth).toEqual({
            userId: "12",
            role: "Patient",
            sessionId: "test-session",
        });
        expect(next).toHaveBeenCalledTimes(1);
    });

    test("clears an invalid token and redirects to login", async () => {
        const { req, res, next } = createMocks("invalid-token");

        jwt.verify.mockImplementation(() => {
            throw new Error("Invalid token");
        });

        await authenticateToken(req, res, next);

        expect(res.clearCookie).toHaveBeenCalledWith(
            "token",
            expect.objectContaining({
                httpOnly: true,
                sameSite: "lax",
                path: "/",
            }),
        );
        expect(res.redirect).toHaveBeenCalledWith(303, "/login");
        expect(User.findByPk).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test("rejects a token without a valid user identifier", async () => {
        const { req, res, next } = createMocks("valid-token");

        jwt.verify.mockReturnValue({
            sub: "",
            role: "Patient",
            sid: "test-session",
        });

        await authenticateToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.send).toHaveBeenCalledWith("Invalid authentication token.");
        expect(User.findByPk).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test("rejects a token without a role", async () => {
        const { req, res, next } = createMocks("valid-token");

        jwt.verify.mockReturnValue({
            sub: "12",
            sid: "test-session",
        });

        await authenticateToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(User.findByPk).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test("rejects an inactive or unavailable account", async () => {
        const { req, res, next } = createMocks("valid-token");

        jwt.verify.mockReturnValue({
            sub: "12",
            role: "Patient",
        });

        User.findByPk.mockResolvedValue(null);

        await authenticateToken(req, res, next);

        expect(res.clearCookie).toHaveBeenCalledWith("token", expect.any(Object));
        expect(res.redirect).toHaveBeenCalledWith(303, "/login");
        expect(next).not.toHaveBeenCalled();
    });

    test("rejects a token when the database role has changed", async () => {
        const { req, res, next } = createMocks("valid-token");

        jwt.verify.mockReturnValue({
            sub: "12",
            role: "Patient",
        });

        User.findByPk.mockResolvedValue({
            id: 12,
            is_active: true,
            rol: { name: "Administrator" },
        });

        await authenticateToken(req, res, next);

        expect(res.clearCookie).toHaveBeenCalledWith("token", expect.any(Object));
        expect(res.redirect).toHaveBeenCalledWith(303, "/login");
        expect(next).not.toHaveBeenCalled();
    });

    test("forwards database errors to Express error handling", async () => {
        const { req, res, next } = createMocks("valid-token");
        const databaseError = new Error("Database unavailable");

        jwt.verify.mockReturnValue({
            sub: "12",
            role: "Patient",
            sid: "test-session",
        });

        User.findByPk.mockRejectedValue(databaseError);

        await authenticateToken(req, res, next);

        expect(next).toHaveBeenCalledWith(databaseError);
        expect(res.redirect).not.toHaveBeenCalled();
    });
});

describe("requireRole middleware", () => {
    test("allows a user with an authorized role", () => {
        const { req, res, next } = createMocks();
        req.auth = { userId: "12", role: "Patient" };

        requireRole("Patient")(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    test("rejects a user with an unauthorized role", () => {
        const { req, res, next } = createMocks();
        req.auth = { userId: "12", role: "Patient" };

        requireRole("Administrator")(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.send).toHaveBeenCalledWith("Access denied.");
        expect(next).not.toHaveBeenCalled();
    });

    test("rejects a request without an authenticated identity", () => {
        const { req, res, next } = createMocks();

        requireRole("Patient")(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test("redirects to login when the session has expired", async () => {
        const { req, res, next } = createMocks("valid-token");

        User.findByPk.mockClear();
        isSessionExpired.mockClear();
        res.clearCookie.mockClear();
        res.redirect.mockClear();

        jwt.verify.mockReturnValue({
            sub: "12",
            role: "Patient",
            sid: "expired-session",
        });

        isSessionExpired.mockReturnValue(true);

        await authenticateToken(req, res, next);

        expect(isSessionExpired).toHaveBeenCalledWith("expired-session");
        expect(res.clearCookie).toHaveBeenCalledWith("token", expect.any(Object));
        expect(res.redirect).toHaveBeenCalledWith(303, "/login");
        expect(User.findByPk).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });
});
