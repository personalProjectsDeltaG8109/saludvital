import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from "@jest/globals";
import bcrypt from "bcrypt";
import database from "../../../config/database.js";
import { EmailOutbox, Patient, Rol, User } from "../../../src/models/associations.js";
import { registerPatient } from "../../../src/modules/auth/services/registrationService.js";

// Refuse to run destructive integration-test cleanup against any other database.
if (process.env.NODE_ENV !== "test" || process.env.DB_NAME !== "saludvital_test") {
    throw new Error(
        "Registration MySQL integration tests require NODE_ENV=test and DB_NAME=saludvital_test.",
    );
}

// Use unique identifiers so these tests never reuse existing accounts.
function createRegistrationData() {
    const uniqueId = randomUUID().replaceAll("-", "");

    return {
        first_name: "Integration",
        last_name: "Test",
        phone: "3001234567",
        date_of_birth: "1990-05-15",
        document_type: "CC",
        document_number: `T${uniqueId.slice(0, 14)}`,
        department: "66",
        municipality: "66001",
        email: `registration-${uniqueId}@example.test`,
        password: "SecureTest123!",
        password_confirmation: "SecureTest123!",
    };
}

// Remove only records identified by this test's unique email and document.
async function cleanRegistrationData(data) {
    const user = await User.findOne({
        where: { email: data.email.toLowerCase() },
        attributes: ["id"],
    });

    if (user) {
        // Delete dependent rows before deleting their parent user.
        await EmailOutbox.destroy({
            where: { user_id: user.id },
        });

        await Patient.destroy({
            where: { user_id: user.id },
        });

        await User.destroy({
            where: { id: user.id, email: data.email.toLowerCase() },
        });
    }

    // Also clean a patient profile only if it matches this test's unique document.
    await Patient.destroy({
        where: {
            document_type: data.document_type,
            document_number: data.document_number,
            user_id: null,
        },
    });
}

describe("Patient registration with real MySQL", () => {
    const registrations = [];
    let patientRole;

    beforeAll(async () => {
        // Authenticate against the dedicated test database before running assertions.
        await database.authenticate();

        patientRole = await Rol.findOne({
            where: { name: "Patient" },
            attributes: ["id"],
        });

        if (!patientRole) {
            throw new Error(
                'The "Patient" role is missing. Run the initial-roles seeder against saludvital_test.',
            );
        }
    });

    afterEach(async () => {
        // Clean only unique test records, including records from failed assertions.
        for (const data of registrations.splice(0)) {
            await cleanRegistrationData(data);
        }

        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await database.close();
    });

    test("creates the user, patient profile, and verification email job", async () => {
        const data = createRegistrationData();
        registrations.push(data);

        const result = await registerPatient(data);

        expect(result).toEqual(
            expect.objectContaining({
                id: expect.any(Number),
                email: data.email.toLowerCase(),
                patientId: expect.any(Number),
            }),
        );

        const user = await User.findByPk(result.id);
        const patient = await Patient.findByPk(result.patientId);
        const emailJob = await EmailOutbox.findOne({
            where: {
                user_id: result.id,
                event_type: "email_verification",
            },
        });

        expect(user).not.toBeNull();
        expect(user.role_id).toBe(patientRole.id);
        expect(user.is_active).toBe(true);
        expect(user.password_hash).not.toBe(data.password);
        expect(await bcrypt.compare(data.password, user.password_hash)).toBe(true);

        expect(patient).not.toBeNull();
        expect(patient.user_id).toBe(user.id);
        expect(patient.document_number).toBe(data.document_number);

        expect(emailJob).not.toBeNull();
        expect(emailJob.status).toBe("pending");
        expect(emailJob.attempts).toBe(0);
    });

    test("rejects an email that already belongs to an account", async () => {
        const originalData = createRegistrationData();
        const duplicateData = {
            ...createRegistrationData(),
            email: originalData.email,
        };

        registrations.push(originalData, duplicateData);

        await registerPatient(originalData);

        await expect(registerPatient(duplicateData)).rejects.toMatchObject({
            name: "RegistrationError",
            statusCode: 409,
        });

        const matchingUsers = await User.count({
            where: { email: originalData.email.toLowerCase() },
        });

        expect(matchingUsers).toBe(1);
    });

    test("rejects a document number already assigned to another patient", async () => {
        const originalData = createRegistrationData();
        const duplicateData = {
            ...createRegistrationData(),
            document_type: originalData.document_type,
            document_number: originalData.document_number,
        };

        registrations.push(originalData, duplicateData);

        await registerPatient(originalData);

        await expect(registerPatient(duplicateData)).rejects.toMatchObject({
            name: "RegistrationError",
            statusCode: 409,
        });

        const matchingPatients = await Patient.count({
            where: {
                document_type: originalData.document_type,
                document_number: originalData.document_number,
            },
        });

        expect(matchingPatients).toBe(1);
    });

    test("rolls back user and patient records when email-job creation fails", async () => {
        const data = createRegistrationData();
        registrations.push(data);

        // Inject a controlled failure while all preceding database writes remain real.
        jest.spyOn(EmailOutbox, "create").mockRejectedValueOnce(
            new Error("Controlled email job creation failure"),
        );

        await expect(registerPatient(data)).rejects.toThrow(
            "Controlled email job creation failure",
        );

        const userCount = await User.count({
            where: { email: data.email.toLowerCase() },
        });

        const patientCount = await Patient.count({
            where: {
                document_type: data.document_type,
                document_number: data.document_number,
            },
        });

        const emailJobCount = await EmailOutbox.count({
            where: {
                event_type: "email_verification",
                user_id: await (async () => {
                    const user = await User.findOne({
                        where: { email: data.email.toLowerCase() },
                        attributes: ["id"],
                    });

                    return user?.id ?? -1;
                })(),
            },
        });

        expect(userCount).toBe(0);
        expect(patientCount).toBe(0);
        expect(emailJobCount).toBe(0);
    });

    // Ensure concurrent registrations cannot create accounts with duplicate emails.
    test("allows only one concurrent registration for the same email", async () => {
        const firstData = createRegistrationData();
        const secondData = {
            ...createRegistrationData(),
            email: firstData.email,
        };

        registrations.push(firstData, secondData);

        const results = await Promise.allSettled([
            registerPatient(firstData),
            registerPatient(secondData),
        ]);

        const successfulResults = results.filter((result) => result.status === "fulfilled");
        const rejectedResults = results.filter((result) => result.status === "rejected");

        expect(successfulResults).toHaveLength(1);
        expect(rejectedResults).toHaveLength(1);
        expect(rejectedResults[0].reason).toMatchObject({
            name: "RegistrationError",
            statusCode: 409,
        });

        const matchingUsers = await User.count({
            where: { email: firstData.email.toLowerCase() },
        });

        expect(matchingUsers).toBe(1);
    });

    // Ensure concurrent registrations cannot reuse the same identity document.
    test("allows only one concurrent registration for the same identity document", async () => {
        const firstData = createRegistrationData();
        const secondData = {
            ...createRegistrationData(),
            document_type: firstData.document_type,
            document_number: firstData.document_number,
        };

        registrations.push(firstData, secondData);

        const results = await Promise.allSettled([
            registerPatient(firstData),
            registerPatient(secondData),
        ]);

        const successfulResults = results.filter((result) => result.status === "fulfilled");
        const rejectedResults = results.filter((result) => result.status === "rejected");

        expect(successfulResults).toHaveLength(1);
        expect(rejectedResults).toHaveLength(1);
        expect(rejectedResults[0].reason).toMatchObject({
            name: "RegistrationError",
            statusCode: 409,
        });

        const matchingPatients = await Patient.count({
            where: {
                document_type: firstData.document_type,
                document_number: firstData.document_number,
            },
        });

        expect(matchingPatients).toBe(1);
    });

    test("rolls back the user when patient profile creation fails", async () => {
        const data = createRegistrationData();
        registrations.push(data);

        // Simulate a patient profile failure after the user has been created.
        jest.spyOn(Patient, "create").mockRejectedValueOnce(
            new Error("Controlled patient profile creation failure"),
        );

        await expect(registerPatient(data)).rejects.toThrow(
            "Controlled patient profile creation failure",
        );

        // Verify that the database transaction removed the partially created account.
        const userCount = await User.count({
            where: { email: data.email.toLowerCase() },
        });

        const patientCount = await Patient.count({
            where: {
                document_type: data.document_type,
                document_number: data.document_number,
            },
        });

        const emailJobCount = await EmailOutbox.count({
            where: { event_type: "email_verification" },
        });

        expect(userCount).toBe(0);
        expect(patientCount).toBe(0);
        expect(emailJobCount).toBeGreaterThanOrEqual(0);
    });
});
