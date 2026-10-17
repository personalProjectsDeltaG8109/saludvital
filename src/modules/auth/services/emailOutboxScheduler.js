import { processEmailOutboxBatch } from "./emailOutboxWorker.js";

// Configure the polling interval and the maximum jobs per batch.
const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_BATCH_SIZE = 10;

let running = false;
let timer = null;
let activeRun = null;

// Start a single non-overlapping email outbox processing loop.
export function startEmailOutboxScheduler({
    intervalMs = DEFAULT_INTERVAL_MS,
    batchSize = DEFAULT_BATCH_SIZE,
} = {}) {
    if (running) {
        return;
    }

    if (!Number.isInteger(intervalMs) || intervalMs < 1000) {
        throw new TypeError("The interval must be an integer of at least 1000 ms.");
    }

    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
        throw new TypeError("The batch size must be an integer between 1 and 100.");
    }

    running = true;

    // Process jobs sequentially and schedule the next run after completion.
    const run = async () => {
        if (!running) {
            return;
        }

        activeRun = processEmailOutboxBatch(batchSize)
            .catch((error) => {
                // Keep the scheduler alive if a processing batch fails.
                console.error("Email outbox scheduler iteration failed.", {
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            })
            .finally(() => {
                activeRun = null;

                if (running) {
                    timer = setTimeout(run, intervalMs);
                }
            });

        await activeRun;
    };

    void run();
}

// Stop future runs and wait for the current batch to finish.
export async function stopEmailOutboxScheduler() {
    running = false;

    if (timer) {
        clearTimeout(timer);
        timer = null;
    }

    if (activeRun) {
        await activeRun;
    }
}
