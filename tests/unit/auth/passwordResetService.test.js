import { beforeEach, describe, expect, jest, test } from "@jest/globals";

// Mock the database and models to isolate password recovery tests.
jest.unstable_mockModule("../../../config/database.js", () => ({
    default: {
        transaction: jest.fn(),
    },
}));

jest.unstable_mockModule("../../../src/models/AuditLog.js", () => ({
    default: { create: jest.fn() },
}));

jest.unstable_mockModule("../../../src/models/associations.js", () => ({
    EmailOutbox: {
        create: jest.fn(),
    },
    PasswordResetToken: {
        findOne: jest.fn(),
        update: jest.fn(),
    },
    Rol: {},
    User: {
        findOne: jest.fn(),
        findByPk: jest.fn(),
    },
}));

jest.unstable_mockModule("bcrypt", () => ({
    default: {
        hash: jest.fn(),
    },
}));

// Mock session revocation to verify password recovery behavior.
jest.unstable_mockModule("../../../src/modules/auth/services/sessionActivity.js", () => ({
    endUserSessions: jest.fn(),
}));

const { default: database } = await import("../../../config/database.js");
const { EmailOutbox, PasswordResetToken, User } =
    await import("../../../src/models/associations.js");
const AuditLog = (await import("../../../src/models/AuditLog.js")).default;
const bcrypt = (await import("bcrypt")).default;

const { requestPasswordReset, resetPassword } =
    await import("../../../src/modules/auth/services/passwordResetService.js");

const { endUserSessions } = await import("../../../src/modules/auth/services/sessionActivity.js");

describe("Password reset service", () => {
    const transaction = { LOCK: { UPDATE: "UPDATE" } };

    beforeEach(() => {
        jest.clearAllMocks();
        endUserSessions.mockClear();
        database.transaction.mockImplementation(async (callback) => callback(transaction));

        User.findOne.mockResolvedValue(null);
        User.findByPk.mockResolvedValue(null);
        EmailOutbox.create.mockResolvedValue({});
        PasswordResetToken.findOne.mockResolvedValue(null);
        PasswordResetToken.update.mockResolvedValue([0]);
        AuditLog.create.mockResolvedValue({ id: 1 });
        bcrypt.hash.mockResolvedValue("hashed-password");
    });

    describe("requestPasswordReset", () => {
        test("returns the same public result for an unknown email", async () => {
            await expect(requestPasswordReset("unknown@example.com")).resolves.toEqual({
                requested: true,
            });

            expect(EmailOutbox.create).not.toHaveBeenCalled();
        });

        test("does not query the database for an invalid email", async () => {
            await expect(requestPasswordReset("invalid-email")).resolves.toEqual({
                requested: true,
            });

            expect(database.transaction).not.toHaveBeenCalled();
        });

        test("queues a recovery email for an active verified account", async () => {
            User.findOne.mockResolvedValue({
                id: 42,
                is_active: true,
                email_verified_at: new Date(),
            });

            await expect(requestPasswordReset(" Patient@Example.com ")).resolves.toEqual({
                requested: true,
            });

            expect(User.findOne).toHaveBeenCalledWith({
                where: {
                    email: "patient@example.com",
                    is_active: true,
                },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });

            expect(EmailOutbox.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    user_id: 42,
                    event_type: "password_reset",
                    status: "pending",
                    attempts: 0,
                }),
                { transaction },
            );
        });

        test("does not queue recovery for an unverified account", async () => {
            User.findOne.mockResolvedValue({
                id: 42,
                is_active: true,
                email_verified_at: null,
            });

            await expect(requestPasswordReset("patient@example.com")).resolves.toEqual({
                requested: true,
            });

            expect(EmailOutbox.create).not.toHaveBeenCalled();
        });
    });

    describe("resetPassword", () => {
        test("rejects malformed tokens without querying the database", async () => {
            await expect(
                resetPassword("invalid-token", "SecurePass1!", "SecurePass1!"),
            ).resolves.toEqual({
                reset: false,
                reason: "invalid_or_expired",
            });

            expect(database.transaction).not.toHaveBeenCalled();
        });

        test("rejects passwords that do not meet the password policy", async () => {
            await expect(resetPassword("a".repeat(64), "weak", "weak")).resolves.toEqual({
                reset: false,
                reason: "invalid_password",
            });

            expect(database.transaction).not.toHaveBeenCalled();
        });

        test("rejects mismatched password confirmation", async () => {
            await expect(
                resetPassword("a".repeat(64), "SecurePass1!", "DifferentPass1!"),
            ).resolves.toEqual({
                reset: false,
                reason: "invalid_password",
            });

            expect(database.transaction).not.toHaveBeenCalled();
        });

        test("rejects tokens that do not exist or have expired", async () => {
            await expect(
                resetPassword("a".repeat(64), "SecurePass1!", "SecurePass1!"),
            ).resolves.toEqual({
                reset: false,
                reason: "invalid_or_expired",
            });

            expect(PasswordResetToken.findOne).toHaveBeenCalledTimes(1);
            expect(User.findByPk).not.toHaveBeenCalled();
        });

        test("updates the password and consumes reset tokens atomically", async () => {
            const resetToken = { user_id: 42 };
            const user = {
                id: 42,
                email: "admin@example.com",
                is_active: true,
                email_verified_at: new Date(),
                rol: { name: "Administrator" },
                update: jest.fn().mockResolvedValue(undefined),
            };

            PasswordResetToken.findOne.mockResolvedValue(resetToken);
            User.findByPk.mockResolvedValue(user);

            await expect(
                resetPassword("a".repeat(64), "SecurePass1!", "SecurePass1!"),
            ).resolves.toEqual({ reset: true });

            expect(PasswordResetToken.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        used_at: null,
                    }),
                    transaction,
                    lock: transaction.LOCK.UPDATE,
                }),
            );

            expect(bcrypt.hash).toHaveBeenCalledWith("SecurePass1!", 12);
            expect(user.update).toHaveBeenCalledWith(
                { password_hash: "hashed-password" },
                { transaction },
            );
            expect(AuditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    actor_user_id: 42,
                    action: "UserPasswordReset",
                    target_type: "User",
                    target_id: "42",
                    changes: null,
                    reason: "Account password reset completed.",
                }),
                { transaction },
            );
            expect(JSON.stringify(AuditLog.create.mock.calls)).not.toMatch(
                /SecurePass1!|hashed-password|token_hash/i,
            );

            expect(PasswordResetToken.update).toHaveBeenCalledWith(
                { used_at: expect.any(Date) },
                {
                    where: {
                        user_id: 42,
                        used_at: null,
                    },
                    transaction,
                },
            );
        });

        test("revokes the user's active sessions after a successful password reset", async () => {
            const resetToken = { user_id: 42 };
            const user = {
                id: 42,
                email: "admin@example.com",
                is_active: true,
                email_verified_at: new Date(),
                rol: { name: "Administrator" },
                update: jest.fn().mockResolvedValue(undefined),
            };

            PasswordResetToken.findOne.mockResolvedValue(resetToken);
            User.findByPk.mockResolvedValue(user);

            await expect(
                resetPassword("a".repeat(64), "SecurePass1!", "SecurePass1!"),
            ).resolves.toEqual({ reset: true });

            expect(endUserSessions).toHaveBeenCalledTimes(1);
            expect(endUserSessions).toHaveBeenCalledWith("42");
        });

        test("does not change audit behavior for non-administrator password resets", async () => {
            const resetToken = { user_id: 42 };
            const user = {
                id: 42,
                email: "patient@example.com",
                is_active: true,
                email_verified_at: new Date(),
                rol: { name: "Patient" },
                update: jest.fn().mockResolvedValue(undefined),
            };
            PasswordResetToken.findOne.mockResolvedValue(resetToken);
            User.findByPk.mockResolvedValue(user);

            await expect(
                resetPassword("a".repeat(64), "SecurePass1!", "SecurePass1!"),
            ).resolves.toEqual({ reset: true });

            expect(AuditLog.create).not.toHaveBeenCalled();
            expect(endUserSessions).toHaveBeenCalledWith("42");
        });

        test("does not revoke sessions when the reset token is invalid", async () => {
            PasswordResetToken.findOne.mockResolvedValue(null);

            await expect(
                resetPassword("a".repeat(64), "SecurePass1!", "SecurePass1!"),
            ).resolves.toEqual({
                reset: false,
                reason: "invalid_or_expired",
            });

            expect(endUserSessions).not.toHaveBeenCalled();
        });

        test("does not revoke sessions when audit persistence fails", async () => {
            const resetToken = { user_id: 42 };
            const user = {
                id: 42,
                email: "admin@example.com",
                is_active: true,
                email_verified_at: new Date(),
                rol: { name: "Administrator" },
                update: jest.fn().mockResolvedValue(undefined),
            };
            PasswordResetToken.findOne.mockResolvedValue(resetToken);
            User.findByPk.mockResolvedValue(user);
            AuditLog.create.mockRejectedValue(new Error("Audit unavailable"));

            await expect(
                resetPassword("a".repeat(64), "SecurePass1!", "SecurePass1!"),
            ).rejects.toThrow("Audit unavailable");

            expect(PasswordResetToken.update).not.toHaveBeenCalled();
            expect(endUserSessions).not.toHaveBeenCalled();
        });
    });
});
