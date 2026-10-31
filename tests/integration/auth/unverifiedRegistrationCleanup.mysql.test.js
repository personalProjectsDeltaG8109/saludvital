import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "@jest/globals";
import database from "../../../config/database.js";
import {
    EmailOutbox,
    NotificationPreference,
    Patient,
    Rol,
    User,
} from "../../../src/models/associations.js";
import { cleanExpiredUnverifiedRegistrations } from "../../../src/modules/auth/services/unverifiedRegistrationCleanupService.js";
import { registerPatient } from "../../../src/modules/auth/services/registrationService.js";

if (process.env.NODE_ENV !== "test" || process.env.DB_NAME !== "saludvital_test") {
    throw new Error(
        "Unverified registration cleanup integration tests require NODE_ENV=test and DB_NAME=saludvital_test.",
    );
}

function createRegistrationData() {
    const uniqueId = randomUUID().replaceAll("-", "");

    return {
        first_name: "Cleanup",
        last_name: "Integration",
        phone: "3001234567",
        date_of_birth: "1990-05-15",
        document_type: "CC",
        document_number: uniqueId
            .split("")
            .map((character) => (parseInt(character, 16) % 10).toString())
            .join("")
            .slice(0, 15),
        department: "66",
        municipality: "66001",
        email: `cleanup-${uniqueId}@example.test`,
        password: "SecureTest123!",
        password_confirmation: "SecureTest123!",
    };
}

describe("Unverified registration cleanup with real MySQL", () => {
    const registrations = [];

    beforeAll(async () => {
        await database.authenticate();
        const patientRole = await Rol.findOne({ where: { name: "Patient" }, attributes: ["id"] });
        if (!patientRole) throw new Error('The "Patient" role is missing from saludvital_test.');
    });

    afterEach(async () => {
        for (const data of registrations.splice(0)) {
            const user = await User.findOne({ where: { email: data.email.toLowerCase() } });
            if (!user) continue;

            const patient = await Patient.findOne({ where: { user_id: user.id } });
            if (patient) {
                await NotificationPreference.destroy({ where: { patient_id: patient.id } });
                await Patient.destroy({ where: { id: patient.id } });
            }
            await EmailOutbox.destroy({ where: { user_id: user.id } });
            await User.destroy({ where: { id: user.id } });
        }
    });

    afterAll(async () => {
        await database.close();
    });

    test("deletes only the expired unverified patient and its verification job", async () => {
        const data = createRegistrationData();
        registrations.push(data);
        const result = await registerPatient(data);
        const staleCreatedAt = new Date("2000-01-01T00:00:00.000Z");
        await database.query("UPDATE users SET created_at = :createdAt WHERE id = :userId", {
            replacements: { createdAt: staleCreatedAt, userId: result.id },
        });

        const cleanupResult = await cleanExpiredUnverifiedRegistrations({
            now: new Date(),
            retentionMinutes: 30,
            afterUserId: result.id - 1,
        });

        expect(cleanupResult.deletedCount).toBeGreaterThanOrEqual(1);
        expect(await User.findByPk(result.id)).toBeNull();
        expect(await Patient.findByPk(result.patientId)).toBeNull();
        expect(
            await EmailOutbox.count({
                where: { user_id: result.id, event_type: "email_verification" },
            }),
        ).toBe(0);
    });

    test("preserves an expired unverified account with a persisted patient preference", async () => {
        const data = createRegistrationData();
        registrations.push(data);
        const result = await registerPatient(data);
        await database.query("UPDATE users SET created_at = :createdAt WHERE id = :userId", {
            replacements: {
                createdAt: new Date("2000-01-01T00:00:00.000Z"),
                userId: result.id,
            },
        });
        await NotificationPreference.create({
            patient_id: result.patientId,
            channel: "Email",
            event_type: "appointment_reminder",
            is_enabled: true,
        });

        const cleanupResult = await cleanExpiredUnverifiedRegistrations({
            now: new Date(),
            afterUserId: result.id - 1,
        });

        expect(cleanupResult.deletedCount).toBe(0);
        expect(await User.findByPk(result.id)).not.toBeNull();
        expect(await Patient.findByPk(result.patientId)).not.toBeNull();
    });
});
