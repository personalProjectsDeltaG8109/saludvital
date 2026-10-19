import { createHash } from "node:crypto";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";

// Mock the user model to isolate the verification service from MySQL.
jest.unstable_mockModule("../../../src/models/associations.js", () => ({
    User: {
        sequelize: {
            transaction: jest.fn(),
        },
        findOne: jest.fn(),
    },
}));

const { User } = await import("../../../src/models/associations.js");
const { verifyEmail } =
    await import("../../../src/modules/auth/services/emailVerificationService.js");

// Calculate the expected database hash without exposing the original token.
function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

describe("Email verification service", () => {
    const token = "a".repeat(64);
    const transaction = {
        LOCK: { UPDATE: "UPDATE" },
    };

    let user;

    beforeEach(() => {
        jest.clearAllMocks();

        user = {
            id: 42,
            update: jest.fn().mockResolvedValue(undefined),
        };

        User.sequelize.transaction.mockImplementation(async (callback) => callback(transaction));

        User.findOne.mockResolvedValue(user);
    });

    test("rejects malformed tokens without querying the database", async () => {
        await expect(verifyEmail("invalid-token")).resolves.toEqual({
            verified: false,
            reason: "invalid",
        });

        expect(User.findOne).not.toHaveBeenCalled();
        expect(User.sequelize.transaction).not.toHaveBeenCalled();
    });

    test("verifies an account and consumes its token", async () => {
        const result = await verifyEmail(token);

        expect(result).toEqual({ verified: true });

        expect(User.findOne).toHaveBeenCalledWith({
            where: {
                email_verification_token_hash: hashToken(token),
                email_verification_expires_at: expect.objectContaining({}),
                email_verified_at: null,
                is_active: true,
            },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        const updateCall = user.update.mock.calls[0][0];

        expect(updateCall.email_verified_at).toBeInstanceOf(Date);
        expect(updateCall.email_verification_token_hash).toBeNull();
        expect(updateCall.email_verification_expires_at).toBeNull();

        expect(user.update).toHaveBeenCalledWith(updateCall, { transaction });
    });

    test("rejects tokens that do not match an eligible account", async () => {
        User.findOne.mockResolvedValue(null);

        await expect(verifyEmail(token)).resolves.toEqual({
            verified: false,
            reason: "invalid_or_expired",
        });

        expect(user.update).not.toHaveBeenCalled();
    });

    test("uses a transaction with a row lock for token consumption", async () => {
        await verifyEmail(token);

        expect(User.sequelize.transaction).toHaveBeenCalledTimes(1);
        expect(User.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                transaction,
                lock: transaction.LOCK.UPDATE,
            }),
        );
    });
});
