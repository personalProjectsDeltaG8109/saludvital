import { jest, describe, test, expect, beforeEach } from "@jest/globals";

import {
    up,
    down,
} from "../../database/migrations/20261015031344-create-auxiliary-security-and-patient-tables.js";

// Verify the auxiliary security and patient tables match their migration schema.
describe("Auxiliary security and patient migration", () => {
    let queryInterface;
    let Sequelize;

    beforeEach(() => {
        // Mock database operations so tests never modify the real database.
        queryInterface = {
            createTable: jest.fn().mockResolvedValue(undefined),
            addConstraint: jest.fn().mockResolvedValue(undefined),
            addIndex: jest.fn().mockResolvedValue(undefined),
            dropTable: jest.fn().mockResolvedValue(undefined),
        };

        // Provide the Sequelize data types used by the migration.
        Sequelize = {
            INTEGER: Object.assign(() => "INTEGER", {
                UNSIGNED: "INTEGER UNSIGNED",
            }),
            STRING: (length) => `VARCHAR(${length})`,
            DATE: "DATETIME",
            TEXT: "TEXT",
            ENUM: (...values) => ({ type: "ENUM", values }),
        };
    });

    test("up creates all four tables in dependency order", async () => {
        await up(queryInterface, Sequelize);

        // Create referenced parent tables before their dependent tables.
        expect(queryInterface.createTable.mock.calls.map(([table]) => table)).toEqual([
            "whatsapp_verifications",
            "whatsapp_appointment_requests",
            "emergency_contacts",
            "password_reset_tokens",
        ]);
    });

    test("WhatsApp verifications reference patients and protect verification data", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "whatsapp_verifications",
        );

        // Verification records must belong to an existing patient.
        expect(columns.patient_id.allowNull).toBe(false);
        expect(columns.patient_id.references).toEqual({
            model: "patients",
            key: "id",
        });
        expect(columns.patient_id.onDelete).toBe("RESTRICT");

        // Store a hash and expiration time rather than a plaintext code.
        expect(columns.code_hash.type).toBe("VARCHAR(255)");
        expect(columns.code_hash.allowNull).toBe(false);
        expect(columns.expires_at.allowNull).toBe(false);
        expect(columns.attempt_count.defaultValue).toBe(0);
        expect(columns.verified_at.allowNull).toBe(true);
        expect(columns.invalidated_at.allowNull).toBe(true);
    });

    test("WhatsApp verifications create patient and expiration indexes", async () => {
        await up(queryInterface, Sequelize);

        expect(queryInterface.addIndex).toHaveBeenCalledWith(
            "whatsapp_verifications",
            ["patient_id"],
            { name: "whatsapp_verifications_patient_id_idx" },
        );

        expect(queryInterface.addIndex).toHaveBeenCalledWith(
            "whatsapp_verifications",
            ["expires_at"],
            { name: "whatsapp_verifications_expires_at_idx" },
        );
    });

    test("WhatsApp appointment requests define their required relationships", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "whatsapp_appointment_requests",
        );

        // Every request must belong to a patient and a WhatsApp conversation.
        expect(columns.patient_id.allowNull).toBe(false);
        expect(columns.patient_id.references).toEqual({
            model: "patients",
            key: "id",
        });

        expect(columns.conversation_id.allowNull).toBe(false);
        expect(columns.conversation_id.references).toEqual({
            model: "whatsapp_conversations",
            key: "id",
        });

        expect(columns.conversation_id.onDelete).toBe("RESTRICT");
    });

    test("WhatsApp appointment requests allow optional specialty, doctor and appointment", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "whatsapp_appointment_requests",
        );

        // Optional references can be cleared when their target is deleted.
        expect(columns.requested_specialty_id.allowNull).toBe(true);
        expect(columns.requested_specialty_id.references).toEqual({
            model: "specialties",
            key: "id",
        });
        expect(columns.requested_specialty_id.onDelete).toBe("SET NULL");

        expect(columns.requested_doctor_id.allowNull).toBe(true);
        expect(columns.requested_doctor_id.references).toEqual({
            model: "doctors",
            key: "id",
        });
        expect(columns.requested_doctor_id.onDelete).toBe("SET NULL");

        expect(columns.appointment_id.allowNull).toBe(true);
        expect(columns.appointment_id.references).toEqual({
            model: "appointments",
            key: "id",
        });
        expect(columns.appointment_id.onDelete).toBe("SET NULL");
    });

    test("WhatsApp appointment requests define statuses and idempotency", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "whatsapp_appointment_requests",
        );

        // Keep request states explicit and prevent duplicate processing keys.
        expect(columns.status.type).toEqual({
            type: "ENUM",
            values: ["Pending", "Confirmed", "Rejected", "Cancelled", "Expired"],
        });
        expect(columns.status.defaultValue).toBe("Pending");
        expect(columns.idempotency_key.allowNull).toBe(false);
        expect(columns.idempotency_key.unique).toBe(true);
    });

    test("WhatsApp appointment requests create lookup indexes", async () => {
        await up(queryInterface, Sequelize);

        expect(queryInterface.addIndex).toHaveBeenCalledWith(
            "whatsapp_appointment_requests",
            ["patient_id"],
            { name: "whatsapp_appointment_requests_patient_id_idx" },
        );

        expect(queryInterface.addIndex).toHaveBeenCalledWith(
            "whatsapp_appointment_requests",
            ["conversation_id", "status"],
            { name: "whatsapp_appointment_requests_conversation_status_idx" },
        );

        expect(queryInterface.addIndex).toHaveBeenCalledWith(
            "whatsapp_appointment_requests",
            ["appointment_id"],
            { name: "whatsapp_appointment_requests_appointment_id_idx" },
        );
    });

    test("emergency contacts reference patients and define contact fields", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "emergency_contacts",
        );

        // A contact belongs to a patient and is removed with that patient.
        expect(columns.patient_id.allowNull).toBe(false);
        expect(columns.patient_id.references).toEqual({
            model: "patients",
            key: "id",
        });
        expect(columns.patient_id.onDelete).toBe("CASCADE");

        expect(columns.first_name.type).toBe("VARCHAR(50)");
        expect(columns.last_name.type).toBe("VARCHAR(50)");
        expect(columns.phone.type).toBe("VARCHAR(15)");
        expect(columns.email.type).toBe("VARCHAR(254)");
        expect(columns.relationship.type).toBe("VARCHAR(50)");
        expect(columns.email.allowNull).toBe(true);
        expect(columns.relationship.allowNull).toBe(true);
    });

    test("emergency contacts create a patient lookup index", async () => {
        await up(queryInterface, Sequelize);

        expect(queryInterface.addIndex).toHaveBeenCalledWith("emergency_contacts", ["patient_id"], {
            name: "emergency_contacts_patient_id_idx",
        });
    });

    test("password reset tokens reference users and store token lifecycle fields", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "password_reset_tokens",
        );

        // Reset tokens belong to users and are removed with their account.
        expect(columns.user_id.allowNull).toBe(false);
        expect(columns.user_id.references).toEqual({
            model: "users",
            key: "id",
        });
        expect(columns.user_id.onDelete).toBe("CASCADE");

        // Store the token hash and lifecycle timestamps, never the plaintext token.
        expect(columns.token_hash.type).toBe("VARCHAR(255)");
        expect(columns.token_hash.allowNull).toBe(false);
        expect(columns.expires_at.allowNull).toBe(false);
        expect(columns.used_at.allowNull).toBe(true);
    });

    test("password reset tokens create user and expiration indexes", async () => {
        await up(queryInterface, Sequelize);

        expect(queryInterface.addIndex).toHaveBeenCalledWith("password_reset_tokens", ["user_id"], {
            name: "password_reset_tokens_user_id_idx",
        });

        expect(queryInterface.addIndex).toHaveBeenCalledWith(
            "password_reset_tokens",
            ["expires_at"],
            { name: "password_reset_tokens_expires_at_idx" },
        );
    });

    test("down drops all four tables in reverse dependency order", async () => {
        await down(queryInterface);

        // Remove dependent tables before the referenced parent tables.
        expect(queryInterface.dropTable.mock.calls).toEqual([
            ["password_reset_tokens"],
            ["emergency_contacts"],
            ["whatsapp_appointment_requests"],
            ["whatsapp_verifications"],
        ]);
    });
});
