import { beforeEach, describe, expect, jest, test } from "@jest/globals";

// Mock the password hashing library before importing the authentication service.
jest.unstable_mockModule("bcrypt", () => ({
    default: {
        compare: jest.fn(),
    },
}));

// Mock the existing Sequelize models to isolate authentication logic.
jest.unstable_mockModule("../../../src/models/associations.js", () => ({
    User: {
        findOne: jest.fn(),
    },
    Rol: {},
}));

// Import mocked dependencies and the service after registering the mocks.
const bcrypt = (await import("bcrypt")).default;
const { User } = await import("../../../src/models/associations.js");

const { authenticateUser, AuthenticationError, EmailVerificationRequiredError } =
    await import("../../../src/modules/auth/services/authService.js");

// Prepare consistent mock data for each authentication test.
describe("Authentication service", () => {
    const user = {
        id: 7,
        email: "patient@example.com",
        password_hash: "$2b$12$mocked-password-hash",
        email_verified_at: new Date(),
        rol: {
            id: 1,
            name: "Patient",
        },
        update: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        User.findOne.mockResolvedValue(user);
        bcrypt.compare.mockResolvedValue(true);
        user.update.mockResolvedValue(undefined);
    });

    // Authenticate a valid user and return safe account information.
    test("authenticates a valid user and updates the last login timestamp", async () => {
        const result = await authenticateUser(" Patient@Example.com ", "CorrectPassword123!");

        expect(User.findOne).toHaveBeenCalledWith({
            where: {
                email: "patient@example.com",
                is_active: true,
            },
            include: [
                {
                    model: expect.anything(),
                    as: "rol",
                    attributes: ["id", "name"],
                    required: true,
                },
            ],
        });

        expect(bcrypt.compare).toHaveBeenCalledWith("CorrectPassword123!", user.password_hash);

        expect(user.update).toHaveBeenCalledWith({
            last_login_at: expect.any(Date),
        });

        expect(result).toEqual({
            id: 7,
            email: "patient@example.com",
            role: "Patient",
        });

        expect(result).not.toHaveProperty("password_hash");
    });

    // Reject an account that does not exist.
    test("rejects an unknown user", async () => {
        User.findOne.mockResolvedValue(null);

        await expect(
            authenticateUser("unknown@example.com", "AnyPassword123!"),
        ).rejects.toMatchObject({
            name: "AuthenticationError",
            statusCode: 401,
            message: "Invalido el email o contraseña.",
        });

        expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    // Reject an incorrect password without updating the account.
    test("rejects an incorrect password", async () => {
        bcrypt.compare.mockResolvedValue(false);

        await expect(
            authenticateUser("patient@example.com", "WrongPassword123!"),
        ).rejects.toBeInstanceOf(AuthenticationError);

        expect(user.update).not.toHaveBeenCalled();
    });

    // Reject an account whose email has not been verified.
    test("rejects a user with an unverified email", async () => {
        User.findOne.mockResolvedValue({
            ...user,
            email_verified_at: null,
        });

        await expect(
            authenticateUser("patient@example.com", "CorrectPassword123!"),
        ).rejects.toBeInstanceOf(EmailVerificationRequiredError);

        expect(user.update).not.toHaveBeenCalled();
    });

    // Reject missing or malformed credential values.
    test.each([
        ["empty email", "", "Password123!"],
        ["missing email", undefined, "Password123!"],
        ["empty password", "patient@example.com", ""],
        ["missing password", "patient@example.com", undefined],
        ["non-string password", "patient@example.com", 12345],
        ["oversized email", "a".repeat(81), "Password123!"],
    ])("rejects invalid credentials: %s", async (_case, email, password) => {
        await expect(authenticateUser(email, password)).rejects.toBeInstanceOf(AuthenticationError);

        expect(User.findOne).not.toHaveBeenCalled();
        expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    // Reject an account whose role association is unavailable.
    test("rejects a user without an associated role", async () => {
        User.findOne.mockResolvedValue({
            ...user,
            rol: null,
        });

        await expect(
            authenticateUser("patient@example.com", "CorrectPassword123!"),
        ).rejects.toBeInstanceOf(TypeError);
    });
});
