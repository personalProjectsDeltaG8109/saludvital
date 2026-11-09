import { cleanupExpiredSessions } from "./sessionActivity.js";

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_BATCH_SIZE = 100;

let running = false;
let timer = null;
let activeRun = null;

// Run one bounded cleanup batch at a time across the server lifecycle.
export function startSessionCleanupScheduler({
    intervalMs = DEFAULT_INTERVAL_MS,
    batchSize = DEFAULT_BATCH_SIZE,
} = {}) {
    if (running) return;
    if (!Number.isInteger(intervalMs) || intervalMs < 1000) {
        throw new TypeError("The session cleanup interval must be at least 1000 ms.");
    }
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
        throw new TypeError("The session cleanup batch size must be between 1 and 500.");
    }

    running = true;

    const run = async () => {
        if (!running) return;

        activeRun = cleanupExpiredSessions({ batchSize })
            .catch((error) => {
                // Keep cleanup failures safe and let the next bounded run retry.
                console.error("Expired session cleanup failed.", {
                    errorName: error instanceof Error ? error.name : "UnknownError",
                });
            })
            .finally(() => {
                activeRun = null;
                if (running) timer = setTimeout(run, intervalMs);
            });

        await activeRun;
    };

    void run();
}

export async function stopSessionCleanupScheduler() {
    running = false;

    if (timer) {
        clearTimeout(timer);
        timer = null;
    }

    if (activeRun) await activeRun;
}
