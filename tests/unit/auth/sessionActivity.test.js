import {
    startSession,
    refreshSession,
    isSessionExpired,
    endSession,
    endUserSessions,
} from "../../../src/modules/auth/services/sessionActivity.js";

describe("Session activity service", () => {
    // Create unique session IDs to avoid collisions between tests.
    let sessionPrefix;

    beforeEach(() => {
        sessionPrefix = `test-${Date.now()}-${Math.random()}`;
    });

    test("should register and recognize an active session", () => {
        const sessionId = `${sessionPrefix}-active`;

        startSession(sessionId, 101);

        expect(isSessionExpired(sessionId)).toBe(false);
    });

    test("should refresh an existing session", () => {
        const sessionId = `${sessionPrefix}-refresh`;

        startSession(sessionId, 101);

        expect(refreshSession(sessionId)).toBe(true);
        expect(isSessionExpired(sessionId)).toBe(false);
    });

    test("should reject a session that does not exist", () => {
        expect(isSessionExpired(`${sessionPrefix}-missing`)).toBe(true);
        expect(refreshSession(`${sessionPrefix}-missing`)).toBe(false);
    });

    test("should remove a session when it ends", () => {
        const sessionId = `${sessionPrefix}-end`;

        startSession(sessionId, 101);
        endSession(sessionId);

        expect(isSessionExpired(sessionId)).toBe(true);
    });

    test("should revoke all sessions belonging to one user", () => {
        const firstSession = `${sessionPrefix}-first`;
        const secondSession = `${sessionPrefix}-second`;
        const otherUserSession = `${sessionPrefix}-other`;

        startSession(firstSession, 101);
        startSession(secondSession, 101);
        startSession(otherUserSession, 202);

        endUserSessions(101);

        expect(isSessionExpired(firstSession)).toBe(true);
        expect(isSessionExpired(secondSession)).toBe(true);
        expect(isSessionExpired(otherUserSession)).toBe(false);

        // Clean up the session belonging to the other user.
        endSession(otherUserSession);
    });

    test("should support numeric and string user IDs consistently", () => {
        const sessionId = `${sessionPrefix}-user-id`;

        startSession(sessionId, 101);
        endUserSessions("101");

        expect(isSessionExpired(sessionId)).toBe(true);
    });
});
