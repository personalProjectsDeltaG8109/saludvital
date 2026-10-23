import { processNotificationBatch } from "./notificationWorker.js";
import { backfillUpcomingAppointmentReminders } from "./notificationAutomationService.js";

const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_BATCH_SIZE = 10;
let running = false;
let timer = null;
let activeRun = null;

export function startNotificationScheduler({
    intervalMs = DEFAULT_INTERVAL_MS,
    batchSize = DEFAULT_BATCH_SIZE,
} = {}) {
    if (running) return;
    if (!Number.isInteger(intervalMs) || intervalMs < 1000) {
        throw new TypeError("The interval must be an integer of at least 1000 ms.");
    }
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
        throw new TypeError("The batch size must be an integer between 1 and 100.");
    }

    running = true;
    const run = async () => {
        if (!running) return;
        activeRun = processNotificationBatch(batchSize)
            .catch((error) => {
                console.error("Notification scheduler iteration failed.", {
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            })
            .finally(() => {
                activeRun = null;
                if (running) timer = setTimeout(run, intervalMs);
            });
        await activeRun;
    };

    activeRun = backfillUpcomingAppointmentReminders()
        .then((count) => {
            if (count) console.log(`Queued ${count} upcoming appointment reminder(s).`);
        })
        .catch((error) => {
            console.error("Upcoming appointment reminder backfill failed.", {
                error: error instanceof Error ? error.message : "Unknown error",
            });
        })
        .finally(() => {
            activeRun = null;
            if (running) void run();
        });
}

export async function stopNotificationScheduler() {
    running = false;
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
    if (activeRun) await activeRun;
}
