import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Op } from "sequelize";

jest.unstable_mockModule("../../../src/models/associations.js", () => ({
    EmailOutbox: { create: jest.fn(), findOne: jest.fn(), update: jest.fn() },
    User: { findOne: jest.fn() },
}));

const { EmailOutbox, User } = await import("../../../src/models/associations.js");
const {
    getEmailChangeAttributes,
    isEmailUnavailable,
    isEmailUniqueConstraintError,
    requestEmailChange,
} = await import("../../../src/modules/auth/services/emailChangeService.js");

describe("email change helpers", () => {
    const transaction = { LOCK: { UPDATE: "UPDATE" } };

    beforeEach(() => {
        jest.clearAllMocks();
        EmailOutbox.findOne.mockResolvedValue(null);
        EmailOutbox.update.mockResolvedValue([0]);
        EmailOutbox.create.mockResolvedValue({ id: 12 });
    });

    test("keeps a verified address while recording its replacement request", () => {
        const user = {
            email: "current@example.com",
            email_verified_at: new Date("2026-10-01T12:00:00.000Z"),
        };
        const requestedAt = new Date("2026-11-09T12:00:00.000Z");

        expect(getEmailChangeAttributes(user, "replacement@example.com", requestedAt)).toEqual({
            pending_email: "replacement@example.com",
            email_verification_requested_at: requestedAt,
            email_verification_token_hash: null,
            email_verification_expires_at: null,
        });
    });

    test("updates the address of an account that has not yet been verified", () => {
        const user = { email: "old@example.com", email_verified_at: null };

        expect(getEmailChangeAttributes(user, "updated@example.com")).toEqual({
            email: "updated@example.com",
            email_verified_at: null,
            pending_email: null,
            email_verification_requested_at: null,
            email_verification_token_hash: null,
            email_verification_expires_at: null,
        });
    });

    test("checks active and pending addresses while excluding the edited account", async () => {
        User.findOne.mockResolvedValue({ id: 5 });

        await expect(isEmailUnavailable("used@example.com", 9, transaction)).resolves.toBe(true);

        expect(User.findOne).toHaveBeenCalledWith({
            where: {
                id: { [Op.ne]: 9 },
                [Op.or]: [{ email: "used@example.com" }, { pending_email: "used@example.com" }],
            },
            attributes: ["id"],
            transaction,
        });
    });

    test("recognizes uniqueness conflicts on active or pending email fields", () => {
        expect(
            isEmailUniqueConstraintError({
                name: "SequelizeUniqueConstraintError",
                fields: { pending_email: "used@example.com" },
            }),
        ).toBe(true);
        expect(isEmailUniqueConstraintError(new Error("database unavailable"))).toBe(false);
    });

    test("queues verification and cancels older pending verification jobs atomically", async () => {
        const user = {
            id: 9,
            email: "current@example.com",
            email_verified_at: new Date("2026-10-01T12:00:00.000Z"),
            update: jest.fn(),
        };
        const requestedAt = new Date("2026-11-09T12:00:00.000Z");

        await requestEmailChange(user, "new@example.com", transaction, requestedAt);

        expect(EmailOutbox.update).toHaveBeenCalledWith(
            { status: "failed", locked_at: null, next_attempt_at: requestedAt },
            {
                where: {
                    user_id: 9,
                    event_type: "email_verification",
                    status: "pending",
                },
                transaction,
            },
        );
        expect(user.update).toHaveBeenCalledWith(
            expect.objectContaining({ pending_email: "new@example.com" }),
            { transaction },
        );
        expect(EmailOutbox.create).toHaveBeenCalledWith(
            expect.objectContaining({
                user_id: 9,
                event_type: "email_verification",
                status: "pending",
                next_attempt_at: requestedAt,
            }),
            { transaction },
        );
    });

    test("does not change an address while its verification email is being sent", async () => {
        const user = { id: 9, update: jest.fn() };
        EmailOutbox.findOne.mockResolvedValue({ id: 22 });

        await expect(
            requestEmailChange(user, "new@example.com", transaction),
        ).rejects.toMatchObject({
            status: 409,
        });

        expect(EmailOutbox.update).not.toHaveBeenCalled();
        expect(user.update).not.toHaveBeenCalled();
        expect(EmailOutbox.create).not.toHaveBeenCalled();
    });
});
