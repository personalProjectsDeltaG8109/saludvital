import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { createHash } from "node:crypto";

// Mock database models and email delivery before importing the worker.
jest.unstable_mockModule("../../../config/database.js", () => ({
    default: {
        transaction: jest.fn(),
    },
}));

jest.unstable_mockModule("../../../src/models/associations.js", () => ({
    EmailOutbox: {
        update: jest.fn(),
        findOne: jest.fn(),
        findByPk: jest.fn(),
    },
    User: {
        findByPk: jest.fn(),
    },
    PasswordResetToken: {
        update: jest.fn(),
        create: jest.fn(),
    },
}));

jest.unstable_mockModule("../../../src/modules/auth/services/emailService.js", () => ({
    sendVerificationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
}));

const { default: database } = await import("../../../config/database.js");
const { EmailOutbox, PasswordResetToken, User } =
    await import("../../../src/models/associations.js");
const { sendPasswordResetEmail, sendVerificationEmail } =
    await import("../../../src/modules/auth/services/emailService.js");
const { processNextEmailOutboxJob, processEmailOutboxBatch } =
    await import("../../../src/modules/auth/services/emailOutboxWorker.js");

describe("Email outbox worker", () => {
    const transaction = { LOCK: { UPDATE: "UPDATE" } };

    beforeEach(() => {
        jest.clearAllMocks();

        database.transaction.mockImplementation(async (callback) => callback(transaction));

        EmailOutbox.update.mockResolvedValue([0]);
        EmailOutbox.findOne.mockResolvedValue(null);
        EmailOutbox.findByPk.mockResolvedValue(null);
        User.findByPk.mockResolvedValue(null);
        sendVerificationEmail.mockResolvedValue(undefined);
        PasswordResetToken.update.mockResolvedValue([0]);
        PasswordResetToken.create.mockResolvedValue({});
        sendPasswordResetEmail.mockResolvedValue(undefined);

        process.env.APP_BASE_URL = "http://localhost:3000";
        process.env.NODE_ENV = "test";
    });

    // Return without processing when the queue is empty.
    test("does not process a job when no task is available", async () => {
        await expect(processNextEmailOutboxJob()).resolves.toEqual({
            processed: false,
        });

        expect(sendVerificationEmail).not.toHaveBeenCalled();
    });

    // Reject invalid batch limits before processing any jobs.
    test.each([0, -1, 101, 1.5, "10"])("rejects invalid batch limit: %s", async (limit) => {
        await expect(processEmailOutboxBatch(limit)).rejects.toThrow(TypeError);
    });

    // Process no more than the requested number of jobs.
    test("returns zero processed jobs for an empty batch", async () => {
        await expect(processEmailOutboxBatch(5)).resolves.toEqual({
            processed: 0,
        });

        expect(EmailOutbox.findOne).toHaveBeenCalledTimes(1);
    });

    test("sends a password reset email with a hashed, expiring token", async () => {
        const now = new Date();

        const user = {
            id: 42,
            email: "patient@example.com",
            is_active: true,
            email_verified_at: now,
        };

        const job = {
            id: 7,
            user_id: 42,
            event_type: "password_reset",
            attempts: 0,
            update: jest.fn(async (values) => {
                Object.assign(job, values);
            }),
        };

        EmailOutbox.findOne.mockResolvedValue(job);
        EmailOutbox.findByPk.mockResolvedValue(job);
        User.findByPk.mockResolvedValue(user);

        await expect(processNextEmailOutboxJob()).resolves.toEqual({
            processed: true,
            status: "sent",
        });

        expect(PasswordResetToken.update).toHaveBeenCalledWith(
            { used_at: expect.any(Date) },
            expect.objectContaining({
                where: expect.objectContaining({
                    user_id: 42,
                    used_at: null,
                }),
                transaction,
            }),
        );

        const [tokenData, options] = PasswordResetToken.create.mock.calls[0];

        expect(tokenData.user_id).toBe(42);
        expect(tokenData.token_hash).toMatch(/^[a-f0-9]{64}$/);
        expect(tokenData.token_hash).not.toEqual(expect.stringMatching(/^$/));
        expect(tokenData.expires_at.getTime()).toBeGreaterThan(Date.now());
        expect(tokenData.used_at).toBeNull();
        expect(tokenData.created_at).toBeInstanceOf(Date);
        expect(options).toEqual({ transaction });

        expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);

        const [email, resetUrl] = sendPasswordResetEmail.mock.calls[0];
        const parsedUrl = new URL(resetUrl);
        const rawToken = parsedUrl.searchParams.get("token");

        expect(email).toBe(user.email);
        expect(parsedUrl.pathname).toBe("/reset-password");
        expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
        expect(createHash("sha256").update(rawToken).digest("hex")).toBe(tokenData.token_hash);
        expect(resetUrl).not.toContain(tokenData.token_hash);

        expect(job.update).toHaveBeenCalledWith(expect.objectContaining({ status: "processing" }), {
            transaction,
        });
    });

    test("expires verification tokens 30 minutes after registration", async () => {
        const createdAt = new Date(Date.now() - 2 * 60 * 1000);
        const user = {
            id: 43,
            email: "new-patient@example.com",
            is_active: true,
            email_verified_at: null,
            created_at: createdAt,
            update: jest.fn().mockResolvedValue(undefined),
        };
        const job = {
            id: 9,
            user_id: user.id,
            event_type: "email_verification",
            attempts: 0,
            update: jest.fn().mockResolvedValue(undefined),
        };

        EmailOutbox.findOne.mockResolvedValue(job);
        EmailOutbox.findByPk.mockResolvedValue(job);
        User.findByPk.mockResolvedValue(user);

        await expect(processNextEmailOutboxJob()).resolves.toEqual({
            processed: true,
            status: "sent",
        });

        const verificationData = user.update.mock.calls[0][0];
        expect(verificationData.email_verification_expires_at).toEqual(
            new Date(createdAt.getTime() + 30 * 60 * 1000),
        );
        expect(verificationData.email_verification_token_hash).toMatch(/^[a-f0-9]{64}$/);
        expect(sendVerificationEmail).toHaveBeenCalledWith(
            user.email,
            expect.stringContaining("/verify-email?token="),
        );
    });

    test("does not send a verification link after the registration retention expires", async () => {
        const user = {
            id: 44,
            email: "expired-patient@example.com",
            is_active: true,
            email_verified_at: null,
            created_at: new Date(Date.now() - 31 * 60 * 1000),
            update: jest.fn().mockResolvedValue(undefined),
        };
        const job = {
            id: 10,
            user_id: user.id,
            event_type: "email_verification",
            attempts: 1,
            update: jest.fn(async (values) => {
                Object.assign(job, values);
            }),
        };
        const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

        EmailOutbox.findOne.mockResolvedValue(job);
        EmailOutbox.findByPk.mockResolvedValue(job);
        User.findByPk.mockResolvedValue(user);

        try {
            await expect(processNextEmailOutboxJob()).resolves.toEqual({
                processed: true,
                status: "retry_scheduled",
            });
            expect(sendVerificationEmail).not.toHaveBeenCalled();
            expect(user.update).not.toHaveBeenCalled();
            expect(job.update).toHaveBeenCalledWith(
                expect.objectContaining({ status: "pending" }),
                { transaction },
            );
        } finally {
            consoleError.mockRestore();
        }
    });

    // Reject invalid reset URL configuration before touching reset tokens.
    test("does not create or invalidate reset tokens when the base URL is invalid", async () => {
        const job = {
            id: 8,
            user_id: 42,
            event_type: "password_reset",
            attempts: 1,
            update: jest.fn().mockResolvedValue(undefined),
        };

        EmailOutbox.findOne.mockResolvedValue(job);
        EmailOutbox.findByPk.mockResolvedValue(job);
        process.env.APP_BASE_URL = "invalid-url";

        // Capture the expected error log without polluting test output.
        const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

        try {
            await expect(processNextEmailOutboxJob()).resolves.toEqual({
                processed: true,
                status: "retry_scheduled",
            });

            // Confirm that the worker logged the expected configuration failure.
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                "Email outbox delivery failed.",
                expect.objectContaining({
                    jobId: 8,
                    eventType: "password_reset",
                    attempt: 1,
                    error: expect.any(String),
                }),
            );

            // Invalid configuration must not create or invalidate reset tokens.
            expect(User.findByPk).not.toHaveBeenCalled();
            expect(PasswordResetToken.update).not.toHaveBeenCalled();
            expect(PasswordResetToken.create).not.toHaveBeenCalled();
            expect(sendPasswordResetEmail).not.toHaveBeenCalled();
        } finally {
            // Restore console.error even if an assertion fails.
            consoleErrorSpy.mockRestore();
        }
    });
});
