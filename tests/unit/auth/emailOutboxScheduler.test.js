import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

// Mock the email worker to isolate scheduler behavior.
jest.unstable_mockModule("../../../src/modules/auth/services/emailOutboxWorker.js", () => ({
    processEmailOutboxBatch: jest.fn(),
}));

const { processEmailOutboxBatch } =
    await import("../../../src/modules/auth/services/emailOutboxWorker.js");

const { startEmailOutboxScheduler, stopEmailOutboxScheduler } =
    await import("../../../src/modules/auth/services/emailOutboxScheduler.js");

describe("Email outbox scheduler", () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        processEmailOutboxBatch.mockResolvedValue({ processed: 0 });
    });

    afterEach(async () => {
        await stopEmailOutboxScheduler();
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    // Reject invalid scheduling configuration.
    test("rejects an interval shorter than one second", () => {
        expect(() => startEmailOutboxScheduler({ intervalMs: 500 })).toThrow(TypeError);
    });

    test("rejects a batch size outside the supported range", () => {
        expect(() => startEmailOutboxScheduler({ batchSize: 101 })).toThrow(TypeError);
    });

    // Start only one scheduler when called more than once.
    test("does not start duplicate scheduler loops", async () => {
        startEmailOutboxScheduler({ intervalMs: 5000 });
        startEmailOutboxScheduler({ intervalMs: 5000 });

        await jest.advanceTimersByTimeAsync(0);

        expect(processEmailOutboxBatch).toHaveBeenCalledTimes(1);
        expect(processEmailOutboxBatch).toHaveBeenCalledWith(10);
    });

    // Schedule the next batch only after the previous batch completes.
    test("schedules the next batch after the interval", async () => {
        startEmailOutboxScheduler({ intervalMs: 5000, batchSize: 4 });

        await jest.advanceTimersByTimeAsync(0);
        expect(processEmailOutboxBatch).toHaveBeenCalledTimes(1);
        expect(processEmailOutboxBatch).toHaveBeenCalledWith(4);

        await jest.advanceTimersByTimeAsync(4999);
        expect(processEmailOutboxBatch).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(1);
        expect(processEmailOutboxBatch).toHaveBeenCalledTimes(2);
    });

    // Stop the scheduler and prevent further batches.
    test("stops scheduling future batches", async () => {
        startEmailOutboxScheduler({ intervalMs: 5000 });

        await jest.advanceTimersByTimeAsync(0);
        await stopEmailOutboxScheduler();
        await jest.advanceTimersByTimeAsync(10000);

        expect(processEmailOutboxBatch).toHaveBeenCalledTimes(1);
    });

    // Keep the scheduler alive when a batch rejects.
    test("continues scheduling after a batch fails", async () => {
        processEmailOutboxBatch
            .mockRejectedValueOnce(new Error("Temporary worker failure"))
            .mockResolvedValueOnce({ processed: 0 });

        const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

        try {
            startEmailOutboxScheduler({ intervalMs: 5000 });

            await jest.advanceTimersByTimeAsync(0);
            expect(processEmailOutboxBatch).toHaveBeenCalledTimes(1);

            await jest.advanceTimersByTimeAsync(5000);
            expect(processEmailOutboxBatch).toHaveBeenCalledTimes(2);
        } finally {
            consoleError.mockRestore();
        }
    });
});
