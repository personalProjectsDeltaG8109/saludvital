import {
    expireInactiveWhatsAppIdentitySessions,
    purgeExpiredWhatsAppVerificationCodes,
    purgeExpiredWhatsAppMessageContent,
} from "./whatsappWebhookService.js";

const RETENTION_CHECK_INTERVAL_MS = 60 * 60 * 1000;
let retentionTimer = null;
let activeCleanup = null;

async function runCleanup() {
    if (activeCleanup) return activeCleanup;
    activeCleanup = Promise.all([
        purgeExpiredWhatsAppMessageContent(),
        expireInactiveWhatsAppIdentitySessions(),
        purgeExpiredWhatsAppVerificationCodes(),
    ]).finally(() => {
        activeCleanup = null;
    });
    return activeCleanup;
}

export function startWhatsAppRetentionScheduler() {
    if (retentionTimer) return;
    void runCleanup().catch((error) => {
        console.error("WhatsApp retention cleanup failed.", { errorName: error?.name || "Error" });
    });
    retentionTimer = setInterval(() => {
        void runCleanup().catch((error) => {
            console.error("WhatsApp retention cleanup failed.", {
                errorName: error?.name || "Error",
            });
        });
    }, RETENTION_CHECK_INTERVAL_MS);
    retentionTimer.unref?.();
}

export async function stopWhatsAppRetentionScheduler() {
    if (retentionTimer) clearInterval(retentionTimer);
    retentionTimer = null;
    if (activeCleanup) await activeCleanup;
}
