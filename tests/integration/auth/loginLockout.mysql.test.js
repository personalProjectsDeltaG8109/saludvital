import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "@jest/globals";
import database from "../../../config/database.js";
import { Rol, User } from "../../../src/models/associations.js";
import {
    authenticateUser,
    AuthenticationError,
    LoginTemporarilyLockedError,
} from "../../../src/modules/auth/services/authService.js";

if (process.env.NODE_ENV !== "test" || process.env.DB_NAME !== "saludvital_test") {
    throw new Error(
        "Login lockout integration tests require the dedicated saludvital_test database.",
    );
}

describe("Login lockout with real MySQL", () => {
    const createdEmails = [];
    let patientRole;

    beforeAll(async () => {
        await database.authenticate();
        patientRole = await Rol.findOne({ where: { name: "Patient" }, attributes: ["id"] });

        if (!patientRole) {
            throw new Error('The "Patient" role is missing from saludvital_test.');
        }
    });

    afterEach(async () => {
        for (const email of createdEmails.splice(0)) {
            await User.destroy({ where: { email } });
        }
    });

    afterAll(async () => {
        await database.close();
    });

    async function createUser({ verified = true, failedAttempts = 0, lockedUntil = null } = {}) {
        const email = `login-lockout-${randomUUID()}@example.test`;
        createdEmails.push(email);

        return User.create({
            role_id: patientRole.id,
            email,
            password_hash: await bcrypt.hash("CorrectPassword123!", 4),
            is_active: true,
            email_verified_at: verified ? new Date() : null,
            failed_login_attempts: failedAttempts,
            login_locked_until: lockedUntil,
        });
    }

    test("persists the five-failure threshold and serializes concurrent attempts", async () => {
        const user = await createUser();
        const attempts = Array.from({ length: 6 }, () =>
            authenticateUser(user.email, "WrongPassword123!").catch((error) => error),
        );

        const results = await Promise.all(attempts);
        const storedUser = await User.findByPk(user.id);

        expect(
            results.every(
                (result) =>
                    result instanceof AuthenticationError ||
                    result instanceof LoginTemporarilyLockedError,
            ),
        ).toBe(true);
        expect(results.some((result) => result instanceof LoginTemporarilyLockedError)).toBe(true);
        expect(storedUser.failed_login_attempts).toBe(5);
        expect(storedUser.login_locked_until.getTime()).toBeGreaterThan(Date.now());
        expect(storedUser.login_locked_until.getTime()).toBeLessThanOrEqual(
            Date.now() + 15 * 60 * 1000,
        );
    });

    test("resets an expired lock before processing another failed attempt", async () => {
        const user = await createUser({
            failedAttempts: 5,
            lockedUntil: new Date(Date.now() - 1000),
        });

        await expect(authenticateUser(user.email, "WrongPassword123!")).rejects.toBeInstanceOf(
            AuthenticationError,
        );

        const storedUser = await User.findByPk(user.id);
        expect(storedUser.failed_login_attempts).toBe(1);
        expect(storedUser.login_locked_until).toBeNull();
    });

    test("does not count a correct password when the account only needs email verification", async () => {
        const user = await createUser({ verified: false, failedAttempts: 2 });

        await expect(authenticateUser(user.email, "CorrectPassword123!")).rejects.toMatchObject({
            name: "EmailVerificationRequiredError",
            statusCode: 403,
        });

        const storedUser = await User.findByPk(user.id);
        expect(storedUser.failed_login_attempts).toBe(2);
        expect(storedUser.login_locked_until).toBeNull();
    });
});
