import { jest, describe, beforeEach, afterEach, it, expect } from "@jest/globals";

const create = jest.fn();
const update = jest.fn();
const count = jest.fn();
const destroy = jest.fn();

jest.unstable_mockModule("../../src/models/AuthSession.js", () => ({
    default: { create, update, count, destroy },
}));

const { startSession, refreshSession, isSessionExpired, endSession, endUserSessions } =
    await import("../../src/modules/auth/services/sessionActivity.js");

describe("persistent authentication sessions", () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date("2026-11-07T18:00:00.000Z"));
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it("stores only a hash of the session identifier", async () => {
        create.mockResolvedValue({});
        await startSession("secret-session-id", 42);

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                session_id_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
                user_id: 42,
                last_activity_at: new Date("2026-11-07T18:00:00.000Z"),
            }),
        );
        expect(JSON.stringify(create.mock.calls)).not.toContain("secret-session-id");
    });

    it("refreshes only an existing unexpired session belonging to the user", async () => {
        update.mockResolvedValue([1]);
        await expect(refreshSession("session-id", 42)).resolves.toBe(true);
        const options = update.mock.calls[0][1];
        expect(options.where.user_id).toBe(42);
        expect(options.where.last_activity_at).toBeDefined();

        update.mockResolvedValue([0]);
        await expect(refreshSession("session-id", 42)).resolves.toBe(false);
    });

    it("treats missing or expired sessions as expired", async () => {
        count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
        await expect(isSessionExpired("session-id")).resolves.toBe(true);
        await expect(isSessionExpired("session-id")).resolves.toBe(false);
    });

    it("revokes one session or all sessions for an account", async () => {
        destroy.mockResolvedValue(1);
        await endSession("session-id");
        expect(destroy).toHaveBeenCalledWith({
            where: { session_id_hash: expect.stringMatching(/^[a-f0-9]{64}$/) },
        });

        await endUserSessions(42);
        expect(destroy).toHaveBeenCalledWith({ where: { user_id: 42 } });
    });

    it("propagates storage errors instead of silently accepting a session", async () => {
        update.mockRejectedValue(new Error("Database unavailable"));
        await expect(refreshSession("session-id", 42)).rejects.toThrow("Database unavailable");
    });
});
