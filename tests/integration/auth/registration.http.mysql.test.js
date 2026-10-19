import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "@jest/globals";
import request from "supertest";
import database from "../../../config/database.js";
import { EmailOutbox, Patient, Rol, User } from "../../../src/models/associations.js";
import app from "../../../app.js";

// Prevent this integration test from running against a non-test database.
if (process.env.NODE_ENV !== "test" || process.env.DB_NAME !== "saludvital_test") {
    throw new Error(
        "HTTP registration integration tests require NODE_ENV=test and DB_NAME=saludvital_test.",
    );
}

// Generate unique credentials so the test never reuses an existing account.
function createRegistrationData() {
    const uniqueId = randomUUID().replaceAll("-", "");

    return {
        first_name: "HTTP",
        last_name: "Integration",
        phone: "3001234567",
        date_of_birth: "1990-05-15",
        document_type: "CC",
        document_number: `H${uniqueId.slice(0, 14)}`,
        department: "66",
        municipality: "66001",
        email: `http-registration-${uniqueId}@example.test`,
        password: "SecureTest123!",
        password_confirmation: "SecureTest123!",
        health_data_consent: "accepted",
        medical_conditions: "None",
    };
}

// Submit a real form request through Express and its registration middleware.
function submitRegistration(data) {
    return request(app).post("/register").type("form").send(data);
}

// Delete only the user and related rows created with this test's unique data.
async function cleanRegistrationData(data) {
    const user = await User.findOne({
        where: { email: data.email.toLowerCase() },
        attributes: ["id"],
    });

    if (user) {
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

    // Clean a matching orphan only if it uses this test's unique document.
    await Patient.destroy({
        where: {
            document_type: data.document_type,
            document_number: data.document_number,
            user_id: null,
        },
    });
}

describe("Patient registration HTTP integration with MySQL", () => {
    const registrations = [];

    beforeAll(async () => {
        await database.authenticate();

        const patientRole = await Rol.findOne({
            where: { name: "Patient" },
            attributes: ["id"],
        });

        if (!patientRole) {
            throw new Error('The "Patient" role is missing from saludvital_test.');
        }
    });

    afterEach(async () => {
        for (const data of registrations.splice(0)) {
            await cleanRegistrationData(data);
        }
    });

    afterAll(async () => {
        await database.close();
    });

    test("creates a patient through HTTP and persists all registration records", async () => {
        const data = createRegistrationData();
        registrations.push(data);

        const response = await submitRegistration(data);

        expect(response.status).toBe(201);
        expect(response.text).toContain("Registro completado");
        expect(response.text).toContain(data.email);
        expect(response.text).not.toContain(data.password);

        const user = await User.findOne({
            where: { email: data.email.toLowerCase() },
        });

        expect(user).not.toBeNull();

        const patient = await Patient.findOne({
            where: { user_id: user.id },
        });

        expect(patient).not.toBeNull();
        expect(patient.document_number).toBe(data.document_number);

        // Verify that canonical location names are stored instead of submitted codes.
        expect(patient.department).toBe("RISARALDA");
        expect(patient.municipality).toBe("PEREIRA");

        const emailJob = await EmailOutbox.findOne({
            where: {
                user_id: user.id,
                event_type: "email_verification",
            },
        });

        expect(emailJob).not.toBeNull();
        expect(emailJob.status).toBe("pending");
    });

    test("rejects a municipality that does not belong to the selected department", async () => {
        const data = createRegistrationData();
        registrations.push(data);

        // Submit Pereira with Antioquia to simulate a manipulated request.
        data.department = "05";
        data.municipality = "66001";

        const response = await submitRegistration(data);

        expect(response.status).toBe(400);
        expect(response.text).toContain(
            "Selecciona un municipio válido para el departamento seleccionado.",
        );

        // Confirm that the rejected request created no user.
        const userCount = await User.count({
            where: { email: data.email.toLowerCase() },
        });

        expect(userCount).toBe(0);

        // Confirm that no patient was created for the submitted document.
        const patientCount = await Patient.count({
            where: {
                document_type: data.document_type,
                document_number: data.document_number,
            },
        });

        expect(patientCount).toBe(0);
    });

    test("rejects a form without health data consent and creates no account", async () => {
        const data = createRegistrationData();
        registrations.push(data);
        delete data.health_data_consent;

        const response = await submitRegistration(data);

        expect(response.status).toBe(400);
        expect(response.text).toContain("autorizar el tratamiento");

        const userCount = await User.count({
            where: { email: data.email.toLowerCase() },
        });

        expect(userCount).toBe(0);
    });

    test("rejects duplicate registration through HTTP", async () => {
        const data = createRegistrationData();
        registrations.push(data);

        const firstResponse = await submitRegistration(data);

        expect(firstResponse.status).toBe(201);

        const duplicateResponse = await submitRegistration(data);

        expect(duplicateResponse.status).toBe(409);
        expect(duplicateResponse.text).toContain("Ya existe");

        const userCount = await User.count({
            where: { email: data.email.toLowerCase() },
        });

        expect(userCount).toBe(1);
    });
});
