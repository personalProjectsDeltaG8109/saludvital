import { markMissedAppointments } from "./noShowAppointmentService.js";

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_BATCH_SIZE = 50;

let running = false;
let timer = null;
let activeRun = null;

export function startNoShowAppointmentScheduler({
    intervalMs = DEFAULT_INTERVAL_MS,
    batchSize = DEFAULT_BATCH_SIZE,
} = {}) {
    if (running) return;
    if (!Number.isInteger(intervalMs) || intervalMs < 1000) {
        throw new TypeError("The no-show scheduler interval must be at least 1000 ms.");
    }
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
        throw new TypeError("The no-show scheduler batch size must be between 1 and 500.");
    }

    running = true;
    const run = async () => {
        if (!running) return;
        activeRun = markMissedAppointments({ batchSize })
            .catch((error) => {
                console.error("No-show appointment processing failed.", {
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

export async function stopNoShowAppointmentScheduler() {
    running = false;
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
    if (activeRun) await activeRun;
}
