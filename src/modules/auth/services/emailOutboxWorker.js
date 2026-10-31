import { createHash, randomBytes } from "node:crypto";
import { Op } from "sequelize";
import database from "../../../../config/database.js";
import environment from "../../../../config/environment.js";
import { EmailOutbox, PasswordResetToken, User } from "../../../models/associations.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "./emailService.js";

// Configure retry delays and recovery limits.
const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MINUTES = [1, 5, 15, 30, 60];
const LOCK_TIMEOUT_MINUTES = 5;
const VERIFICATION_TOKEN_MINUTES = environment.unverifiedRegistrationRetentionMinutes;
// Keep password reset tokens valid for 30 minutes.
const PASSWORD_RESET_TOKEN_MINUTES = 30;

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

/**
 * Validate the public application URL before creating a reset token.
 */
function validatePasswordResetBaseUrl() {
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

    return parsedUrl;
}

/**
 * Build a password reset URL using the validated application URL.
 */
function buildPasswordResetUrl(token) {
    const parsedUrl = validatePasswordResetBaseUrl();

    parsedUrl.pathname = `${parsedUrl.pathname.replace(/\/+$/, "")}/reset-password`;
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
    const now = new Date();

    return database.transaction(async (transaction) => {
        const user = await User.findByPk(userId, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (!user || !user.is_active || user.email_verified_at) {
            throw new Error("The account is unavailable for email verification.");
        }

        const expiresAt = new Date(
            new Date(user.created_at).getTime() + VERIFICATION_TOKEN_MINUTES * 60 * 1000,
        );

        if (expiresAt <= now) {
            throw new Error("The account is no longer eligible for email verification.");
        }

        await user.update(
            {
                email_verification_token_hash: tokenHash,
                email_verification_expires_at: expiresAt,
            },
            { transaction },
        );

        return { email: user.email, token };
    });
}

/**
 * Create a password reset token and persist only its SHA-256 hash.
 */
async function preparePasswordResetToken(userId) {
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TOKEN_MINUTES * 60 * 1000);
    return database.transaction(async (transaction) => {
        const user = await User.findByPk(userId, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        // Only active accounts with verified email addresses can reset passwords.
        if (!user || !user.is_active || !user.email_verified_at) {
            throw new Error("The account is unavailable for password recovery.");
        }

        // Invalidate previously issued, unused reset tokens.
        await PasswordResetToken.update(
            { used_at: now },
            {
                where: {
                    user_id: userId,
                    used_at: null,
                    expires_at: { [Op.gt]: now },
                },
                transaction,
            },
        );

        // Store the token hash, never the original token.
        await PasswordResetToken.create(
            {
                user_id: userId,
                token_hash: tokenHash,
                expires_at: expiresAt,
                used_at: null,
                created_at: now,
            },
            { transaction },
        );

        return { email: user.email, token };
    });
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
        if (job.eventType === "email_verification") {
            const { email, token } = await prepareVerificationToken(job.userId);
            const verificationUrl = buildVerificationUrl(token);

            await sendVerificationEmail(email, verificationUrl);
        } else if (job.eventType === "password_reset") {
            // Validate configuration before creating or invalidating reset tokens.
            validatePasswordResetBaseUrl();

            const { email, token } = await preparePasswordResetToken(job.userId);
            const resetUrl = buildPasswordResetUrl(token);

            await sendPasswordResetEmail(email, resetUrl);
        } else {
            throw new Error("Unsupported email outbox event type.");
        }

        await recordEmailSuccess(job.id);

        return { processed: true, status: "sent" };
    } catch (error) {
        // Do not log verification tokens, URLs, passwords, or email contents.
        console.error("Email outbox delivery failed.", {
            jobId: job.id,
            eventType: job.eventType,
            attempt: job.attempts,
            error: error.message,
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
