import { beforeEach, describe, expect, jest, test } from "@jest/globals";

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
}));

jest.unstable_mockModule("../../../src/modules/auth/services/emailService.js", () => ({
    sendVerificationEmail: jest.fn(),
}));

const { default: database } = await import("../../../config/database.js");
const { EmailOutbox, User } = await import("../../../src/models/associations.js");
const { sendVerificationEmail } =
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
});
