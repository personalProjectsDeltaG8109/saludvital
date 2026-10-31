import environment from "../../../../config/environment.js";
import { cleanExpiredUnverifiedRegistrations } from "./unverifiedRegistrationCleanupService.js";

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_BATCH_SIZE = 50;

let running = false;
let timer = null;
let activeRun = null;
let afterUserId = 0;

export function startUnverifiedRegistrationCleanupScheduler({
    intervalMs = DEFAULT_INTERVAL_MS,
    batchSize = DEFAULT_BATCH_SIZE,
} = {}) {
    if (running) return;
    if (!Number.isInteger(intervalMs) || intervalMs < 1000) {
        throw new TypeError("The cleanup interval must be an integer of at least 1000 ms.");
    }
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
        throw new TypeError("The cleanup batch size must be an integer between 1 and 100.");
    }

    running = true;

    const run = async () => {
        if (!running) return;

        activeRun = cleanExpiredUnverifiedRegistrations({
            retentionMinutes: environment.unverifiedRegistrationRetentionMinutes,
            batchSize,
            afterUserId,
        })
            .then((result) => {
                afterUserId = result.nextAfterUserId;
            })
            .catch((error) => {
                // Keep the scheduler running without logging account data or SQL details.
                console.error("Unverified registration cleanup failed.", {
                    errorType: error instanceof Error ? error.name : "UnknownError",
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

export async function stopUnverifiedRegistrationCleanupScheduler() {
    running = false;
    afterUserId = 0;

    if (timer) {
        clearTimeout(timer);
        timer = null;
    }

    if (activeRun) await activeRun;
}
