import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("../../../config/environment.js", () => ({
    default: { unverifiedRegistrationRetentionMinutes: 30 },
}));

jest.unstable_mockModule(
    "../../../src/modules/auth/services/unverifiedRegistrationCleanupService.js",
    () => ({ cleanExpiredUnverifiedRegistrations: jest.fn() }),
);

const { cleanExpiredUnverifiedRegistrations } =
    await import("../../../src/modules/auth/services/unverifiedRegistrationCleanupService.js");
const { startUnverifiedRegistrationCleanupScheduler, stopUnverifiedRegistrationCleanupScheduler } =
    await import("../../../src/modules/auth/services/unverifiedRegistrationCleanupScheduler.js");

describe("Unverified registration cleanup scheduler", () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        cleanExpiredUnverifiedRegistrations.mockResolvedValue({
            deletedCount: 0,
            examinedCount: 0,
            nextAfterUserId: 0,
        });
    });

    afterEach(async () => {
        await stopUnverifiedRegistrationCleanupScheduler();
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    test("starts one bounded cleanup loop with the configured retention", async () => {
        startUnverifiedRegistrationCleanupScheduler({ intervalMs: 5000, batchSize: 12 });
        startUnverifiedRegistrationCleanupScheduler({ intervalMs: 5000, batchSize: 12 });

        await jest.advanceTimersByTimeAsync(0);

        expect(cleanExpiredUnverifiedRegistrations).toHaveBeenCalledTimes(1);
        expect(cleanExpiredUnverifiedRegistrations).toHaveBeenCalledWith({
            retentionMinutes: 30,
            batchSize: 12,
            afterUserId: 0,
        });
    });

    test("keeps scheduling after a cleanup failure", async () => {
        cleanExpiredUnverifiedRegistrations
            .mockRejectedValueOnce(new Error("Database failure"))
            .mockResolvedValueOnce({
                deletedCount: 0,
                examinedCount: 0,
                nextAfterUserId: 0,
            });
        const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

        try {
            startUnverifiedRegistrationCleanupScheduler({ intervalMs: 5000 });
            await jest.advanceTimersByTimeAsync(0);
            await jest.advanceTimersByTimeAsync(5000);

            expect(cleanExpiredUnverifiedRegistrations).toHaveBeenCalledTimes(2);
            expect(consoleError).toHaveBeenCalledWith("Unverified registration cleanup failed.", {
                errorType: "Error",
            });
        } finally {
            consoleError.mockRestore();
        }
    });

    test("continues with the next candidate batch", async () => {
        cleanExpiredUnverifiedRegistrations
            .mockResolvedValueOnce({
                deletedCount: 0,
                examinedCount: 50,
                nextAfterUserId: 120,
            })
            .mockResolvedValueOnce({
                deletedCount: 0,
                examinedCount: 0,
                nextAfterUserId: 0,
            });

        startUnverifiedRegistrationCleanupScheduler({ intervalMs: 5000 });
        await jest.advanceTimersByTimeAsync(0);
        await jest.advanceTimersByTimeAsync(5000);

        expect(cleanExpiredUnverifiedRegistrations.mock.calls[1][0]).toEqual({
            retentionMinutes: 30,
            batchSize: 50,
            afterUserId: 120,
        });
    });

    test.each([500, 101])("rejects invalid scheduler settings: %s", (value) => {
        expect(() =>
            startUnverifiedRegistrationCleanupScheduler(
                value < 1000 ? { intervalMs: value } : { batchSize: value },
            ),
        ).toThrow(TypeError);
    });
});
