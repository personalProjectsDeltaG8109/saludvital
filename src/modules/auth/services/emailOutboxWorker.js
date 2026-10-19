import { createHash, randomBytes } from "node:crypto";
import { Op } from "sequelize";
import database from "../../../../config/database.js";
import { EmailOutbox, User } from "../../../models/associations.js";
import { sendVerificationEmail } from "./emailService.js";

// Configure retry delays and recovery limits.
const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MINUTES = [1, 5, 15, 30, 60];
const LOCK_TIMEOUT_MINUTES = 5;
const VERIFICATION_TOKEN_MINUTES = 30;

// Build a verification URL using the configured public application URL.
function buildVerificationUrl(token) {
    const baseUrl = process.env.APP_BASE_URL;

    if (!baseUrl) {
        throw new Error("APP_BASE_URL must be configured.");
    }

    const parsedUrl = new URL(baseUrl);

    if (
        !["http:", "https:"].includes(parsedUrl.protocol) ||
        parsedUrl.username ||
        parsedUrl.password ||
        parsedUrl.search ||
        parsedUrl.hash
    ) {
        throw new Error("APP_BASE_URL is invalid.");
    }

    // Require HTTPS outside local development.
    if (process.env.NODE_ENV === "production" && parsedUrl.protocol !== "https:") {
        throw new Error("APP_BASE_URL must use HTTPS in production.");
    }

    parsedUrl.pathname = `${parsedUrl.pathname.replace(/\/+$/, "")}/verify-email`;
    parsedUrl.search = new URLSearchParams({ token }).toString();

    return parsedUrl.toString();
}

// Claim one available job while holding a database row lock.
async function claimEmailOutboxJob() {
    const now = new Date();
    const staleLockTime = new Date(now.getTime() - LOCK_TIMEOUT_MINUTES * 60 * 1000);

    return database.transaction(async (transaction) => {
        // Mark expired processing jobs as failed when no attempts remain.
        await EmailOutbox.update(
            {
                status: "failed",
                locked_at: null,
                next_attempt_at: now,
            },
            {
                where: {
                    status: "processing",
                    attempts: { [Op.gte]: MAX_ATTEMPTS },
                    locked_at: { [Op.lte]: staleLockTime },
                },
                transaction,
            },
        );

        // Find a pending job or recover an expired processing job.
        const job = await EmailOutbox.findOne({
            where: {
                attempts: { [Op.lt]: MAX_ATTEMPTS },
                [Op.or]: [
                    {
                        status: "pending",
                        next_attempt_at: { [Op.lte]: now },
                    },
                    {
                        status: "processing",
                        locked_at: { [Op.lte]: staleLockTime },
                    },
                ],
            },
            order: [
                ["next_attempt_at", "ASC"],
                ["id", "ASC"],
            ],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (!job) {
            return null;
        }

        // Claim the job and count the attempt atomically.
        await job.update(
            {
                status: "processing",
                locked_at: now,
                attempts: job.attempts + 1,
            },
            { transaction },
        );

        return {
            id: job.id,
            userId: job.user_id,
            eventType: job.event_type,
            attempts: job.attempts,
        };
    });
}

// Generate a secure token and store only its hash and expiration.
async function prepareVerificationToken(userId) {
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_MINUTES * 60 * 1000);

    const user = await User.findByPk(userId);

    if (!user || !user.is_active || user.email_verified_at) {
        throw new Error("The account is unavailable for email verification.");
    }

    await user.update({
        email_verification_token_hash: tokenHash,
        email_verification_expires_at: expiresAt,
    });

    return { email: user.email, token };
}

// Schedule a retry with progressive delays or mark the job as failed.
async function recordEmailFailure(job) {
    const now = new Date();
    const retryDelay =
        RETRY_DELAYS_MINUTES[Math.min(job.attempts - 1, RETRY_DELAYS_MINUTES.length - 1)];

    await database.transaction(async (transaction) => {
        const currentJob = await EmailOutbox.findByPk(job.id, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (!currentJob || currentJob.status !== "processing") {
            return;
        }

        const canRetry = currentJob.attempts < MAX_ATTEMPTS;

        await currentJob.update(
            {
                status: canRetry ? "pending" : "failed",
                next_attempt_at: canRetry ? new Date(now.getTime() + retryDelay * 60 * 1000) : now,
                locked_at: null,
            },
            { transaction },
        );
    });
}

// Mark a successfully delivered email job as sent.
async function recordEmailSuccess(jobId) {
    await database.transaction(async (transaction) => {
        const job = await EmailOutbox.findByPk(jobId, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (!job || job.status !== "processing") {
            return;
        }

        await job.update(
            {
                status: "sent",
                sent_at: new Date(),
                locked_at: null,
            },
            { transaction },
        );
    });
}

// Process one pending email delivery job.
export async function processNextEmailOutboxJob() {
    const job = await claimEmailOutboxJob();

    if (!job) {
        return { processed: false };
    }

    try {
        if (job.eventType !== "email_verification") {
            throw new Error("Unsupported email outbox event type.");
        }

        const { email, token } = await prepareVerificationToken(job.userId);
        const verificationUrl = buildVerificationUrl(token);

        await sendVerificationEmail(email, verificationUrl);
        await recordEmailSuccess(job.id);

        return { processed: true, status: "sent" };
    } catch (error) {
        // Do not log verification tokens, URLs, passwords, or email contents.
        console.error("Email outbox delivery failed.", {
            jobId: job.id,
            eventType: job.eventType,
            attempt: job.attempts,
            error: error instanceof Error ? error.message : "Unknown error",
        });

        await recordEmailFailure(job);

        return { processed: true, status: "retry_scheduled" };
    }
}

// Process a bounded number of jobs during each worker run.
export async function processEmailOutboxBatch(limit = 10) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new TypeError("The batch limit must be an integer between 1 and 100.");
    }

    let processed = 0;

    for (let index = 0; index < limit; index += 1) {
        const result = await processNextEmailOutboxJob();

        if (!result.processed) {
            break;
        }

        processed += 1;
    }

    return { processed };
}
