import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Op } from "sequelize";

// Isolate session persistence from the database in unit tests.
const create = jest.fn();
const update = jest.fn();
const findOne = jest.fn();
const findAll = jest.fn();
const destroy = jest.fn();

jest.unstable_mockModule("../../../src/models/AuthSession.js", () => ({
    default: { create, update, findOne, findAll, destroy },
}));

const {
    startSession,
    refreshSession,
    hasActiveSession,
    cleanupExpiredSessions,
    endSession,
    endUserSessions,
} = await import("../../../src/modules/auth/services/sessionActivity.js");

describe("Session activity service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        create.mockResolvedValue({});
        update.mockResolvedValue([1]);
        findOne.mockResolvedValue({ session_id_hash: "stored-hash" });
        findAll.mockResolvedValue([]);
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
        expect(JSON.stringify(create.mock.calls)).not.toContain("active-session");
    });

    test("checks session ownership and expiry without updating activity", async () => {
        const now = new Date("2026-11-09T15:00:00.000Z");

        await expect(hasActiveSession("active-session", 101, now)).resolves.toBe(true);
        expect(findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    user_id: 101,
                    session_id_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
                    last_activity_at: expect.any(Object),
                }),
                attributes: ["session_id_hash"],
            }),
        );
        expect(update).not.toHaveBeenCalled();
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
        findOne.mockResolvedValue(null);
        update.mockResolvedValue([0]);
        await expect(hasActiveSession("missing-session", 101)).resolves.toBe(false);
        await expect(refreshSession("missing-session", 101)).resolves.toBe(false);
    });

    test("accepts a concurrent refresh when the still-active session timestamp did not change", async () => {
        const now = new Date("2026-11-09T15:00:00.000Z");
        update.mockResolvedValue([0]);
        findOne.mockResolvedValue({ session_id_hash: "stored-hash" });

        await expect(refreshSession("active-session", 101, now)).resolves.toBe(true);
        expect(findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    user_id: 101,
                    last_activity_at: { [Op.gt]: new Date(now.getTime() - 180_000) },
                }),
            }),
        );
    });

    test("uses the exact 180-second cutoff for validity and refresh", async () => {
        const now = new Date("2026-11-09T15:00:00.000Z");

        await hasActiveSession("boundary-session", 101, now);
        const validityCutoff = findOne.mock.calls[0][0].where.last_activity_at[Op.gt];
        expect(validityCutoff.getTime()).toBe(now.getTime() - 180_000);

        await refreshSession("boundary-session", 101, now);
        const refreshCutoff = update.mock.calls[0][1].where.last_activity_at[Op.gt];
        expect(refreshCutoff.getTime()).toBe(now.getTime() - 180_000);
    });

    test("deletes only a bounded set of expired sessions", async () => {
        findAll.mockResolvedValue([
            { session_id_hash: "expired-hash-1" },
            { session_id_hash: "expired-hash-2" },
        ]);
        destroy.mockResolvedValue(2);
        const now = new Date("2026-11-09T15:00:00.000Z");

        await expect(cleanupExpiredSessions({ batchSize: 2, now })).resolves.toBe(2);

        expect(findAll).toHaveBeenCalledWith(
            expect.objectContaining({ limit: 2, attributes: ["session_id_hash"] }),
        );
        expect(destroy).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    session_id_hash: { [Op.in]: ["expired-hash-1", "expired-hash-2"] },
                    last_activity_at: expect.any(Object),
                }),
            }),
        );
    });

    test("does not delete active sessions when no expired rows are found", async () => {
        await expect(cleanupExpiredSessions()).resolves.toBe(0);
        expect(destroy).not.toHaveBeenCalled();
    });

    test("rejects an invalid cleanup batch size", async () => {
        await expect(cleanupExpiredSessions({ batchSize: 0 })).rejects.toThrow(
            "The session cleanup batch size must be between 1 and 500.",
        );
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
