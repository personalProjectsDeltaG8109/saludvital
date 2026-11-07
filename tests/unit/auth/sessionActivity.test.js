import { beforeEach, describe, expect, jest, test } from "@jest/globals";

// Isolate session persistence from the database in unit tests.
const create = jest.fn();
const update = jest.fn();
const count = jest.fn();
const destroy = jest.fn();

jest.unstable_mockModule("../../../src/models/AuthSession.js", () => ({
    default: { create, update, count, destroy },
}));

const { startSession, refreshSession, isSessionExpired, endSession, endUserSessions } =
    await import("../../../src/modules/auth/services/sessionActivity.js");

describe("Session activity service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        create.mockResolvedValue({});
        update.mockResolvedValue([1]);
        count.mockResolvedValue(1);
        destroy.mockResolvedValue(1);
    });

    test("registers an active session without persisting its raw identifier", async () => {
        await startSession("active-session", 101);
        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                user_id: 101,
                session_id_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
            }),
        );
        expect(isSessionExpired("active-session")).resolves.toBe(false);
        expect(JSON.stringify(create.mock.calls)).not.toContain("active-session");
    });

    test("refreshes only an existing, unexpired session owned by the user", async () => {
        await expect(refreshSession("refresh-session", 101)).resolves.toBe(true);
        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({ last_activity_at: expect.any(Date) }),
            expect.objectContaining({
                where: expect.objectContaining({
                    user_id: 101,
                    session_id_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
                    last_activity_at: expect.any(Object),
                }),
            }),
        );
    });

    test("rejects missing or expired sessions", async () => {
        count.mockResolvedValue(0);
        update.mockResolvedValue([0]);
        await expect(isSessionExpired("missing-session")).resolves.toBe(true);
        await expect(refreshSession("missing-session", 101)).resolves.toBe(false);
    });

    test("revokes a session when it ends", async () => {
        await endSession("ended-session");
        expect(destroy).toHaveBeenCalledWith({
            where: { session_id_hash: expect.stringMatching(/^[a-f0-9]{64}$/) },
        });
    });

    test("revokes all sessions belonging to a user", async () => {
        await endUserSessions(101);
        expect(destroy).toHaveBeenCalledWith({ where: { user_id: 101 } });
    });

    test("supports numeric and string user IDs consistently", async () => {
        await endUserSessions("101");
        expect(destroy).toHaveBeenCalledWith({ where: { user_id: "101" } });
    });

    test("does not silently accept a failed database refresh", async () => {
        update.mockRejectedValue(new Error("Database unavailable"));
        await expect(refreshSession("session-id", 101)).rejects.toThrow("Database unavailable");
    });
});
