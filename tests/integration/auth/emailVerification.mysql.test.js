import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "@jest/globals";
import database from "../../../config/database.js";
import { Rol, User } from "../../../src/models/associations.js";
import { verifyEmail } from "../../../src/modules/auth/services/emailVerificationService.js";

// Refuse to run destructive test cleanup against another database.
if (process.env.NODE_ENV !== "test" || process.env.DB_NAME !== "saludvital_test") {
    throw new Error(
        "Email verification integration tests require NODE_ENV=test and DB_NAME=saludvital_test.",
    );
}

// Store only the token hash in MySQL, as the application does.
function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

// Generate unique test credentials to avoid affecting existing accounts.
function createVerificationData() {
    const uniqueId = randomUUID().replaceAll("-", "");
    const token = randomBytes(32).toString("hex");

    return {
        email: `email-verification-${uniqueId}@example.test`,
        token,
        tokenHash: hashToken(token),
    };
}

describe("Email verification with real MySQL", () => {
    const createdEmails = [];
    let patientRole;

    beforeAll(async () => {
        await database.authenticate();

        patientRole = await Rol.findOne({
            where: { name: "Patient" },
            attributes: ["id"],
        });

        if (!patientRole) {
            throw new Error('The "Patient" role is missing from saludvital_test.');
        }
    });

    afterEach(async () => {
        // Delete only the users created by this suite.
        for (const email of createdEmails.splice(0)) {
            await User.destroy({
                where: { email },
            });
        }
    });

    afterAll(async () => {
        await database.close();
    });

    async function createUnverifiedUser({
        email,
        tokenHash,
        expiresAt = new Date(Date.now() + 5 * 60 * 1000),
        isActive = true,
    }) {
        createdEmails.push(email);

        return User.create({
            role_id: patientRole.id,
            email,
            password_hash: "integration-test-hash-not-for-authentication",
            is_active: isActive,
            email_verified_at: null,
            email_verification_token_hash: tokenHash,
            email_verification_expires_at: expiresAt,
        });
    }

    test("verifies an account and consumes its token", async () => {
        const data = createVerificationData();

        await createUnverifiedUser(data);

        await expect(verifyEmail(data.token)).resolves.toEqual({
            verified: true,
        });

        const user = await User.findOne({
            where: { email: data.email },
        });

        expect(user.email_verified_at).toBeInstanceOf(Date);
        expect(user.email_verification_token_hash).toBeNull();
        expect(user.email_verification_expires_at).toBeNull();
    });

    test("rejects an expired token without verifying the account", async () => {
        const data = createVerificationData();

        await createUnverifiedUser({
            ...data,
            expiresAt: new Date(Date.now() - 60 * 1000),
        });

        await expect(verifyEmail(data.token)).resolves.toEqual({
            verified: false,
            reason: "invalid_or_expired",
        });

        const user = await User.findOne({
            where: { email: data.email },
        });

        expect(user.email_verified_at).toBeNull();
        expect(user.email_verification_token_hash).toBe(data.tokenHash);
    });

    test("rejects verification for an inactive account", async () => {
        const data = createVerificationData();

        await createUnverifiedUser({
            ...data,
            isActive: false,
        });

        await expect(verifyEmail(data.token)).resolves.toEqual({
            verified: false,
            reason: "invalid_or_expired",
        });

        const user = await User.findOne({
            where: { email: data.email },
        });

        expect(user.email_verified_at).toBeNull();
        expect(user.email_verification_token_hash).toBe(data.tokenHash);
    });

    test("does not allow a consumed token to be reused", async () => {
        const data = createVerificationData();

        await createUnverifiedUser(data);

        await expect(verifyEmail(data.token)).resolves.toEqual({
            verified: true,
        });

        await expect(verifyEmail(data.token)).resolves.toEqual({
            verified: false,
            reason: "invalid_or_expired",
        });
    });

    test("allows at most one concurrent request to consume a token", async () => {
        const data = createVerificationData();

        await createUnverifiedUser(data);

        const results = await Promise.all([verifyEmail(data.token), verifyEmail(data.token)]);

        expect(results.filter((result) => result.verified)).toHaveLength(1);
        expect(results.filter((result) => !result.verified)).toHaveLength(1);

        const user = await User.findOne({
            where: { email: data.email },
        });

        expect(user.email_verified_at).toBeInstanceOf(Date);
        expect(user.email_verification_token_hash).toBeNull();
        expect(user.email_verification_expires_at).toBeNull();
    });
});
