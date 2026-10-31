import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("bcrypt", () => ({
    default: {
        compare: jest.fn(),
    },
}));

jest.unstable_mockModule("../../../config/database.js", () => ({
    default: {
        transaction: jest.fn(),
    },
}));

jest.unstable_mockModule("../../../src/models/associations.js", () => ({
    User: {
        findOne: jest.fn(),
        update: jest.fn(),
    },
    Rol: {},
}));

const bcrypt = (await import("bcrypt")).default;
const database = (await import("../../../config/database.js")).default;
const { User } = await import("../../../src/models/associations.js");
const {
    authenticateUser,
    AuthenticationError,
    LoginTemporarilyLockedError,
    EmailVerificationRequiredError,
    clearLoginFailures,
} = await import("../../../src/modules/auth/services/authService.js");

describe("Authentication service", () => {
    let user;
    let transaction;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers({ now: new Date("2026-10-30T12:00:00.000Z") });

        user = {
            id: 7,
            email: "patient@example.com",
            password_hash: "$2b$12$mocked-password-hash",
            email_verified_at: new Date("2026-10-29T12:00:00.000Z"),
            failed_login_attempts: 0,
            login_locked_until: null,
            rol: { id: 1, name: "Patient" },
            update: jest.fn(async (updates) => Object.assign(user, updates)),
        };
        transaction = { LOCK: { UPDATE: "UPDATE" } };
        database.transaction.mockImplementation((callback) => callback(transaction));
        User.findOne.mockImplementation(async () => user);
        User.update.mockImplementation(async (updates) => Object.assign(user, updates));
        bcrypt.compare.mockResolvedValue(true);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test("authenticates a valid user and clears previous failures", async () => {
        user.failed_login_attempts = 3;
        const result = await authenticateUser(" Patient@Example.com ", "CorrectPassword123!");

        expect(User.findOne).toHaveBeenCalledWith({
            where: { email: "patient@example.com", is_active: true },
            include: [
                {
                    model: expect.anything(),
                    as: "rol",
                    attributes: ["id", "name"],
                    required: true,
                },
            ],
            lock: "UPDATE",
            transaction,
        });
        expect(user.update).toHaveBeenCalledWith(
            { last_login_at: expect.any(Date) },
            { transaction },
        );
        expect(user.failed_login_attempts).toBe(3);
        expect(result).toEqual({ id: 7, email: "patient@example.com", role: "Patient" });
        expect(result).not.toHaveProperty("password_hash");
    });

    test("accepts an account email longer than the former login limit", async () => {
        const email = `${"a".repeat(110)}@example.com`;

        await expect(authenticateUser(email, "CorrectPassword123!")).resolves.toBeDefined();
        expect(User.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ where: { email, is_active: true } }),
        );
    });

    test("clears failures after the login controller establishes a session", async () => {
        user.failed_login_attempts = 4;
        user.login_locked_until = new Date("2026-10-30T12:05:00.000Z");

        await clearLoginFailures(user.id);

        expect(User.update).toHaveBeenCalledWith(
            { failed_login_attempts: 0, login_locked_until: null },
            { where: { id: user.id } },
        );
        expect(user.failed_login_attempts).toBe(0);
        expect(user.login_locked_until).toBeNull();
    });

    test("increments only the failed attempt count for incorrect credentials", async () => {
        bcrypt.compare.mockResolvedValue(false);

        await expect(
            authenticateUser("patient@example.com", "WrongPassword123!"),
        ).rejects.toBeInstanceOf(AuthenticationError);

        expect(user.failed_login_attempts).toBe(1);
        expect(user.login_locked_until).toBeNull();
    });

    test("locks the account for 15 minutes after five consecutive failures", async () => {
        bcrypt.compare.mockResolvedValue(false);

        for (let attempt = 0; attempt < 4; attempt += 1) {
            await expect(
                authenticateUser("patient@example.com", "WrongPassword123!"),
            ).rejects.toBeInstanceOf(AuthenticationError);
        }

        await expect(
            authenticateUser("patient@example.com", "WrongPassword123!"),
        ).rejects.toMatchObject({
            name: "LoginTemporarilyLockedError",
            statusCode: 429,
            lockedUntil: new Date("2026-10-30T12:15:00.000Z"),
        });

        expect(user.failed_login_attempts).toBe(5);
        expect(user.login_locked_until).toEqual(new Date("2026-10-30T12:15:00.000Z"));

        bcrypt.compare.mockClear();
        await expect(
            authenticateUser("patient@example.com", "CorrectPassword123!"),
        ).rejects.toBeInstanceOf(LoginTemporarilyLockedError);
        expect(bcrypt.compare).not.toHaveBeenCalled();
        expect(user.failed_login_attempts).toBe(5);
    });

    test("clears an expired lock before counting a new attempt", async () => {
        user.failed_login_attempts = 5;
        user.login_locked_until = new Date("2026-10-30T11:59:59.000Z");
        bcrypt.compare.mockResolvedValue(false);

        await expect(
            authenticateUser("patient@example.com", "WrongPassword123!"),
        ).rejects.toBeInstanceOf(AuthenticationError);

        expect(user.failed_login_attempts).toBe(1);
        expect(user.login_locked_until).toBeNull();
    });

    test("does not count a correct password when email verification is still required", async () => {
        user.email_verified_at = null;
        user.failed_login_attempts = 2;

        await expect(
            authenticateUser("patient@example.com", "CorrectPassword123!"),
        ).rejects.toBeInstanceOf(EmailVerificationRequiredError);

        expect(user.failed_login_attempts).toBe(2);
        expect(user.update).not.toHaveBeenCalled();
    });

    test("rejects an unknown user without revealing account existence", async () => {
        User.findOne.mockResolvedValue(null);

        await expect(
            authenticateUser("unknown@example.com", "AnyPassword123!"),
        ).rejects.toMatchObject({
            name: "AuthenticationError",
            statusCode: 401,
            message: "Inválido el correo electrónico o la contraseña.",
        });

        expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    test.each([
        ["empty email", "", "Password123!"],
        ["missing email", undefined, "Password123!"],
        ["empty password", "patient@example.com", ""],
        ["missing password", "patient@example.com", undefined],
        ["non-string password", "patient@example.com", 12345],
        ["oversized email", "a".repeat(321), "Password123!"],
    ])(
        "rejects invalid credentials without starting a transaction: %s",
        async (_name, email, password) => {
            await expect(authenticateUser(email, password)).rejects.toBeInstanceOf(
                AuthenticationError,
            );

            expect(database.transaction).not.toHaveBeenCalled();
            expect(User.findOne).not.toHaveBeenCalled();
        },
    );

    test("propagates persistence failures instead of accepting the attempt silently", async () => {
        bcrypt.compare.mockResolvedValue(false);
        user.update.mockRejectedValue(new Error("Database unavailable"));

        await expect(authenticateUser("patient@example.com", "WrongPassword123!")).rejects.toThrow(
            "Database unavailable",
        );
    });
});
