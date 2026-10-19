import { beforeEach, describe, expect, jest, test } from "@jest/globals";

// Mock password hashing to keep registration tests fast and deterministic.
jest.unstable_mockModule("bcrypt", () => ({
    default: {
        hash: jest.fn(),
    },
}));

// Mock the database transaction used by the registration service.
jest.unstable_mockModule("../../../config/database.js", () => ({
    default: {
        transaction: jest.fn(),
    },
}));

// Mock Sequelize models to test registration without a real database.
jest.unstable_mockModule("../../../src/models/associations.js", () => ({
    User: {
        findOne: jest.fn(),
        create: jest.fn(),
    },
    Patient: {
        findOne: jest.fn(),
        create: jest.fn(),
    },
    Rol: {
        findOne: jest.fn(),
    },
    EmailOutbox: {
        create: jest.fn(),
    },
}));

// Import mocked dependencies before importing the service under test.
const bcrypt = (await import("bcrypt")).default;
const { default: database } = await import("../../../config/database.js");
const { User, Patient, Rol, EmailOutbox } = await import("../../../src/models/associations.js");

const { registerPatient, RegistrationError } =
    await import("../../../src/modules/auth/services/registrationService.js");

// Define valid patient data that satisfies the current registration rules.
describe("Patient registration service", () => {
    const validData = {
        first_name: "Juan",
        last_name: "Montoya",
        phone: "3001234567",
        date_of_birth: "1990-05-15",
        document_type: "CC",
        document_number: "123456789",
        department: "Risaralda",
        municipality: "Pereira",
        address: "Main Street 123",
        email: "Patient@Example.com",
        password: "SecurePass123!",
        password_confirmation: "SecurePass123!",
        blood_type: "O+",
        allergies: "",
        existing_conditions: "",
    };

    const transaction = { id: "mock-transaction" };

    beforeEach(() => {
        jest.clearAllMocks();

        // Execute transaction callbacks with a predictable mock transaction.
        database.transaction.mockImplementation(async (callback) => callback(transaction));

        // Configure the default successful registration path.
        User.findOne.mockResolvedValue(null);
        Patient.findOne.mockResolvedValue(null);
        Rol.findOne.mockResolvedValue({ id: 1, name: "Patient" });

        User.create.mockResolvedValue({
            id: 10,
            email: "patient@example.com",
        });

        Patient.create.mockResolvedValue({
            id: 20,
            user_id: 10,
        });

        EmailOutbox.create.mockResolvedValue({ id: 30 });

        bcrypt.hash.mockResolvedValue("$2b$12$mocked-password-hash");
    });

    // Reject missing data before opening a database transaction.
    test("rejects missing registration data", async () => {
        await expect(registerPatient(null)).rejects.toBeInstanceOf(RegistrationError);

        expect(database.transaction).not.toHaveBeenCalled();
    });

    // Reject a non-object payload before writing to the database.
    test.each([
        ["an array", []],
        ["a string", "invalid"],
        ["a number", 123],
    ])("rejects invalid payload types: %s", async (_description, data) => {
        await expect(registerPatient(data)).rejects.toBeInstanceOf(RegistrationError);

        expect(database.transaction).not.toHaveBeenCalled();
    });

    // Reject incomplete data before hashing a password or creating records.
    test("rejects missing required fields", async () => {
        const data = { ...validData, email: " " };

        await expect(registerPatient(data)).rejects.toMatchObject({
            name: "RegistrationError",
            statusCode: 400,
        });

        expect(database.transaction).not.toHaveBeenCalled();
        expect(bcrypt.hash).not.toHaveBeenCalled();
        expect(User.create).not.toHaveBeenCalled();
    });

    // Reject malformed email addresses.
    test("rejects an invalid email address", async () => {
        await expect(registerPatient({ ...validData, email: "invalid-email" })).rejects.toThrow(
            "Ingresa una dirección de correo electrónico válida.",
        );

        expect(database.transaction).not.toHaveBeenCalled();
    });

    // Reject invalid patient identification and contact information.
    test.each([
        ["invalid phone", { phone: "abc123" }],
        ["invalid document type", { document_type: "PASSPORT" }],
        ["invalid document number", { document_number: "123 456" }],
        ["invalid blood type", { blood_type: "XYZ" }],
    ])("rejects invalid patient data: %s", async (_description, changes) => {
        await expect(registerPatient({ ...validData, ...changes })).rejects.toBeInstanceOf(
            RegistrationError,
        );

        // Invalid data must be rejected before opening a transaction.
        expect(database.transaction).not.toHaveBeenCalled();
        expect(User.create).not.toHaveBeenCalled();
    });

    // Reject impossible and future dates of birth.
    test.each(["1990-02-30", "2025-13-01", "invalid-date", "2999-01-01"])(
        "rejects an invalid date of birth: %s",
        async (dateOfBirth) => {
            await expect(
                registerPatient({
                    ...validData,
                    date_of_birth: dateOfBirth,
                }),
            ).rejects.toThrow(
                "Ingresa una fecha de nacimiento válida. No puedes seleccionar una fecha futura.",
            );

            expect(database.transaction).not.toHaveBeenCalled();
        },
    );

    // Accept address and email values at their documented maximum lengths.
    test.each([
        ["address", { address: "A".repeat(150) }],
        ["email", { email: `${"a".repeat(88)}@example.com` }],
    ])("accepts a valid field at its maximum length: %s", async (_description, changes) => {
        await expect(
            registerPatient({ ...validData, ...changes }),
        ).resolves.toBeDefined();

        expect(database.transaction).toHaveBeenCalledTimes(1);
        expect(User.create).toHaveBeenCalledTimes(1);
    });

    test.each([
        ["first name", { first_name: "A".repeat(51) }],
        ["last name", { last_name: "B".repeat(51) }],
        ["phone", { phone: "1".repeat(16) }],
        ["document number", { document_number: "1".repeat(16) }],
        ["department", { department: "D".repeat(101) }],
        ["municipality", { municipality: "M".repeat(101) }],
        ["address", { address: "A".repeat(151) }],
        ["email", { email: `${"a".repeat(101)}@example.com` }],
        ["allergies", { allergies: "A".repeat(256) }],
        ["existing conditions", { existing_conditions: "C".repeat(256) }],
    ])("rejects an oversized field: %s", async (_description, changes) => {
        await expect(registerPatient({ ...validData, ...changes })).rejects.toBeInstanceOf(
            RegistrationError,
        );

        expect(database.transaction).not.toHaveBeenCalled();
        expect(User.create).not.toHaveBeenCalled();
    });

    // Reject passwords that do not meet the configured password policy.
    test.each([
        ["too short", "Abc1!"],
        ["missing uppercase", "securepass123!"],
        ["missing lowercase", "SECUREPASS123!"],
        ["missing a digit", "SecurePassword!"],
        ["missing a special character", "SecurePassword123"],
    ])("rejects a weak password: %s", async (_description, password) => {
        await expect(
            registerPatient({
                ...validData,
                password,
                password_confirmation: password,
            }),
        ).rejects.toBeInstanceOf(RegistrationError);

        expect(database.transaction).not.toHaveBeenCalled();
        expect(User.create).not.toHaveBeenCalled();
    });

    // Reject mismatched password confirmation.
    test("rejects a password confirmation mismatch", async () => {
        await expect(
            registerPatient({
                ...validData,
                password_confirmation: "DifferentPass123!",
            }),
        ).rejects.toThrow("Las contraseñas no coinciden. Verifica que ambas sean iguales.");

        expect(database.transaction).not.toHaveBeenCalled();
    });

    // Prevent registration when the email is already associated with an account.
    test("rejects a duplicate email address", async () => {
        User.findOne.mockResolvedValue({ id: 99, email: "patient@example.com" });

        await expect(registerPatient(validData)).rejects.toMatchObject({
            name: "RegistrationError",
            statusCode: 409,
        });

        expect(Patient.findOne).not.toHaveBeenCalled();
        expect(User.create).not.toHaveBeenCalled();
        expect(Patient.create).not.toHaveBeenCalled();
        expect(EmailOutbox.create).not.toHaveBeenCalled();
    });

    // Prevent registration when the identity document already belongs to a patient.
    test("rejects a duplicate identity document", async () => {
        Patient.findOne.mockResolvedValue({
            id: 99,
            document_type: "CC",
            document_number: "123456789",
        });

        await expect(registerPatient(validData)).rejects.toMatchObject({
            name: "RegistrationError",
            statusCode: 409,
        });

        expect(User.create).not.toHaveBeenCalled();
        expect(Patient.create).not.toHaveBeenCalled();
        expect(EmailOutbox.create).not.toHaveBeenCalled();
    });

    // Do not create accounts if the patient role is unavailable.
    test("rejects registration when the patient role is missing", async () => {
        Rol.findOne.mockResolvedValue(null);

        await expect(registerPatient(validData)).rejects.toMatchObject({
            name: "RegistrationError",
            statusCode: 500,
        });

        expect(User.create).not.toHaveBeenCalled();
        expect(Patient.create).not.toHaveBeenCalled();
        expect(EmailOutbox.create).not.toHaveBeenCalled();
    });

    // Create the account, patient profile, and verification email job atomically.
    test("creates a patient account and queues email verification", async () => {
        const result = await registerPatient(validData);

        expect(database.transaction).toHaveBeenCalledTimes(1);

        expect(User.findOne).toHaveBeenCalledWith({
            where: { email: "patient@example.com" },
            transaction,
        });

        expect(Patient.findOne).toHaveBeenCalledWith({
            where: {
                document_type: "CC",
                document_number: "123456789",
            },
            transaction,
        });

        expect(Rol.findOne).toHaveBeenCalledWith({
            where: { name: "Patient" },
            transaction,
        });

        expect(bcrypt.hash).toHaveBeenCalledWith("SecurePass123!", 12);

        expect(User.create).toHaveBeenCalledWith(
            {
                role_id: 1,
                email: "patient@example.com",
                password_hash: "$2b$12$mocked-password-hash",
                is_active: true,
            },
            { transaction },
        );

        expect(Patient.create).toHaveBeenCalledWith(
            expect.objectContaining({
                user_id: 10,
                first_name: "Juan",
                last_name: "Montoya",
                document_type: "CC",
                document_number: "123456789",
            }),
            { transaction },
        );

        expect(EmailOutbox.create).toHaveBeenCalledWith(
            {
                user_id: 10,
                event_type: "email_verification",
                status: "pending",
                attempts: 0,
                next_attempt_at: expect.any(Date),
            },
            { transaction },
        );

        expect(result).toEqual({
            id: 10,
            email: "patient@example.com",
            patientId: 20,
        });

        expect(result).not.toHaveProperty("password_hash");
    });

    // Never persist the original password in the user record.
    test("stores the password hash instead of the original password", async () => {
        await registerPatient(validData);

        const createdUser = User.create.mock.calls[0][0];

        expect(createdUser.password_hash).toBe("$2b$12$mocked-password-hash");
        expect(createdUser.password_hash).not.toBe(validData.password);
        expect(createdUser).not.toHaveProperty("password");
    });

    // Translate database uniqueness conflicts into a safe client error.
    test("translates database uniqueness conflicts", async () => {
        const uniqueError = new Error("Duplicate key");
        uniqueError.name = "SequelizeUniqueConstraintError";

        User.create.mockRejectedValue(uniqueError);

        await expect(registerPatient(validData)).rejects.toMatchObject({
            name: "RegistrationError",
            statusCode: 409,
        });

        expect(Patient.create).not.toHaveBeenCalled();
        expect(EmailOutbox.create).not.toHaveBeenCalled();
    });
});
