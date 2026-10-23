import { beforeAll, afterAll, describe, test, expect } from "@jest/globals";

import database from "../../config/database.js";

// Register the real Sequelize models and their associations.
await import("../../src/models/associations.js");

describe("MySQL model integration", () => {
    beforeAll(async () => {
        // Authenticate against MySQL without modifying database contents.
        await database.authenticate();
    });

    afterAll(async () => {
        // Release the database connection after the integration tests.
        await database.close();
    });

    // Read the existing table definition without creating or altering tables.
    async function getTableColumns(tableName) {
        const columns = await database.getQueryInterface().describeTable(tableName);

        return Object.keys(columns);
    }

    test("roles table contains its expected columns", async () => {
        const columns = await getTableColumns("roles");

        expect(columns).toEqual(
            expect.arrayContaining(["id", "name", "description", "created_at", "updated_at"]),
        );
    });

    test("users table contains its expected columns", async () => {
        const columns = await getTableColumns("users");

        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "role_id",
                "email",
                "password_hash",
                "is_active",
                "last_login_at",
                "created_at",
                "updated_at",
            ]),
        );
    });

    test("patients table contains its expected columns", async () => {
        const columns = await getTableColumns("patients");

        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "user_id",
                "first_name",
                "last_name",
                "date_of_birth",
                "document_type",
                "document_number",
                "created_at",
                "updated_at",
            ]),
        );
    });

    test("doctors table contains its expected columns", async () => {
        const columns = await getTableColumns("doctors");

        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "user_id",
                "specialty_id",
                "professional_information",
                "created_at",
                "updated_at",
            ]),
        );
    });

    test("specialties table contains its expected columns", async () => {
        const columns = await getTableColumns("specialties");

        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "name",
                "description",
                "is_active",
                "created_at",
                "updated_at",
            ]),
        );
    });

    test("doctor_availability table contains its expected columns", async () => {
        const columns = await getTableColumns("doctor_availability");

        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "doctor_id",
                "day_of_week",
                "start_time",
                "end_time",
                "valid_from",
                "valid_until",
                "is_active",
                "created_at",
                "updated_at",
            ]),
        );
    });

    test("doctor_schedule_exceptions table contains its expected columns", async () => {
        const columns = await getTableColumns("doctor_schedule_exceptions");

        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "doctor_id",
                "start_at",
                "end_at",
                "exception_type",
                "reason",
                "created_by",
                "actor_snapshot",
                "created_at",
            ]),
        );
    });

    test("notification_preferences table contains its expected columns", async () => {
        const columns = await getTableColumns("notification_preferences");

        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "patient_id",
                "channel",
                "event_type",
                "is_enabled",
                "created_at",
                "updated_at",
            ]),
        );
    });

    test("notifications table contains its expected columns", async () => {
        const columns = await getTableColumns("notifications");

        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "patient_id",
                "appointment_id",
                "channel",
                "recipient_address",
                "event_type",
                "status",
                "scheduled_at",
                "sent_at",
                "attempt_count",
                "provider_message_id",
                "last_error",
                "created_at",
                "updated_at",
            ]),
        );
    });

    test("appointment_statuses table contains its expected columns", async () => {
        const columns = await getTableColumns("appointment_statuses");

        expect(columns).toEqual(
            expect.arrayContaining(["id", "name", "description", "created_at", "updated_at"]),
        );
    });

    test("appointments table contains its expected columns", async () => {
        const columns = await getTableColumns("appointments");

        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "patient_id",
                "doctor_id",
                "specialty_id",
                "status_id",
                "start_at",
                "end_at",
                "reason",
                "source",
                "created_at",
                "updated_at",
            ]),
        );
    });

    test("registered associations use the expected foreign keys", () => {
        const {
            Rol,
            User,
            Patient,
            Doctor,
            Specialities,
            Appointment,
            DoctorAvailability,
            DoctorScheduleException,
            NotificationPreference,
            Notification,
            AuditLog,
        } = database.models;

        expect(Rol.associations.usuarios.foreignKey).toBe("role_id");
        expect(User.associations.patient.foreignKey).toBe("user_id");
        expect(User.associations.doctor.foreignKey).toBe("user_id");
        expect(Doctor.associations.specialty.foreignKey).toBe("specialty_id");
        expect(Patient.associations.user.target).toBe(User);
        expect(Specialities.associations.doctors.target).toBe(Doctor);
        expect(User.associations.auditLogs.target).toBe(AuditLog);
        expect(AuditLog.associations.actor.target).toBe(User);
        expect(AuditLog.associations.actor.foreignKey).toBe("actor_user_id");
        expect(AuditLog.rawAttributes.actor_user_id.allowNull).toBe(true);

        // Verify the doctor availability associations.
        expect(Doctor.associations.availability.target).toBe(DoctorAvailability);
        expect(DoctorAvailability.associations.doctor.target).toBe(Doctor);

        // Verify the doctor schedule exception associations.
        expect(Doctor.associations.scheduleExceptions.target).toBe(DoctorScheduleException);
        expect(DoctorScheduleException.associations.doctor.target).toBe(Doctor);

        // Verify the optional user reference for schedule exceptions.
        expect(User.associations.scheduleExceptionsCreated.target).toBe(DoctorScheduleException);
        expect(DoctorScheduleException.associations.creator.target).toBe(User);
        expect(DoctorScheduleException.rawAttributes.created_by.allowNull).toBe(true);

        // Verify notification preference associations.
        expect(Patient.associations.notificationPreferences.target).toBe(NotificationPreference);
        expect(NotificationPreference.associations.patient.target).toBe(Patient);
        expect(NotificationPreference.associations.patient.foreignKey).toBe("patient_id");

        // Verify notification delivery associations.
        expect(Patient.associations.notifications.target).toBe(Notification);
        expect(Notification.associations.patient.target).toBe(Patient);
        expect(Notification.associations.patient.foreignKey).toBe("patient_id");

        expect(Appointment.associations.notifications.target).toBe(Notification);
        expect(Notification.associations.appointment.target).toBe(Appointment);
        expect(Notification.associations.appointment.foreignKey).toBe("appointment_id");

        // Verify the optional appointment reference.
        expect(Notification.rawAttributes.appointment_id.allowNull).toBe(true);
    });

    test("whatsapp_verifications table contains its expected columns", async () => {
        const columns = await getTableColumns("whatsapp_verifications");

        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "patient_id",
                "code_hash",
                "expires_at",
                "attempt_count",
                "verified_at",
                "invalidated_at",
                "created_at",
            ]),
        );
    });

    test("whatsapp_appointment_requests table contains its expected columns", async () => {
        const columns = await getTableColumns("whatsapp_appointment_requests");

        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "patient_id",
                "conversation_id",
                "requested_specialty_id",
                "requested_doctor_id",
                "requested_start_at",
                "appointment_id",
                "status",
                "created_at",
                "updated_at",
                "idempotency_key",
            ]),
        );
    });

    test("foreign keys match the expected delete and update rules", async () => {
        // Read foreign key definitions from the active MySQL database.
        const [foreignKeys] = await database.query(`
            SELECT
                kcu.TABLE_NAME AS tableName,
                kcu.COLUMN_NAME AS columnName,
                kcu.REFERENCED_TABLE_NAME AS referencedTableName,
                kcu.REFERENCED_COLUMN_NAME AS referencedColumnName,
                rc.DELETE_RULE AS deleteRule,
                rc.UPDATE_RULE AS updateRule
            FROM information_schema.KEY_COLUMN_USAGE AS kcu
            INNER JOIN information_schema.REFERENTIAL_CONSTRAINTS AS rc
                ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
                AND rc.TABLE_NAME = kcu.TABLE_NAME
                AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
            WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
                AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
                AND (
                    (kcu.TABLE_NAME = 'users' AND kcu.COLUMN_NAME = 'role_id')
                    OR (kcu.TABLE_NAME = 'patients' AND kcu.COLUMN_NAME = 'user_id')
                    OR (kcu.TABLE_NAME = 'doctors' AND kcu.COLUMN_NAME = 'user_id')
                    OR (kcu.TABLE_NAME = 'doctors' AND kcu.COLUMN_NAME = 'specialty_id')
                    OR (kcu.TABLE_NAME = 'doctor_availability'AND kcu.COLUMN_NAME = 'doctor_id')
                    OR (kcu.TABLE_NAME = 'doctor_schedule_exceptions' AND kcu.COLUMN_NAME = 'doctor_id')
                    OR (kcu.TABLE_NAME = 'doctor_schedule_exceptions' AND kcu.COLUMN_NAME = 'created_by')
                    OR (kcu.TABLE_NAME = 'notification_preferences'AND kcu.COLUMN_NAME = 'patient_id')
                    OR (kcu.TABLE_NAME = 'notifications' AND kcu.COLUMN_NAME = 'patient_id')
                    OR (kcu.TABLE_NAME = 'notifications' AND kcu.COLUMN_NAME = 'appointment_id')
                    OR (kcu.TABLE_NAME = 'audit_logs' AND kcu.COLUMN_NAME = 'actor_user_id')
                    OR (kcu.TABLE_NAME = 'consultations' AND kcu.COLUMN_NAME = 'appointment_id')
                    OR (kcu.TABLE_NAME = 'consultations' AND kcu.COLUMN_NAME = 'doctor_id')
                    OR (kcu.TABLE_NAME = 'diagnoses' AND kcu.COLUMN_NAME = 'consultation_id')
                    OR (kcu.TABLE_NAME = 'prescriptions' AND kcu.COLUMN_NAME = 'consultation_id')
                    OR (kcu.TABLE_NAME = 'prescription_items' AND kcu.COLUMN_NAME = 'prescription_id')
                    OR (kcu.TABLE_NAME = 'emergency_contacts' AND kcu.COLUMN_NAME = 'patient_id')
                    OR (kcu.TABLE_NAME = 'password_reset_tokens' AND kcu.COLUMN_NAME = 'user_id'))
        `);

        // Verify the referenced tables and columns.
        expect(foreignKeys).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    tableName: "users",
                    columnName: "role_id",
                    referencedTableName: "roles",
                    referencedColumnName: "id",
                    deleteRule: "RESTRICT",
                    updateRule: "CASCADE",
                }),
                expect.objectContaining({
                    tableName: "patients",
                    columnName: "user_id",
                    referencedTableName: "users",
                    referencedColumnName: "id",
                    deleteRule: "RESTRICT",
                    updateRule: "CASCADE",
                }),
                expect.objectContaining({
                    tableName: "doctors",
                    columnName: "user_id",
                    referencedTableName: "users",
                    referencedColumnName: "id",
                    deleteRule: "RESTRICT",
                    updateRule: "CASCADE",
                }),
                expect.objectContaining({
                    tableName: "doctors",
                    columnName: "specialty_id",
                    referencedTableName: "specialties",
                    referencedColumnName: "id",
                    deleteRule: "RESTRICT",
                    updateRule: "CASCADE",
                }),

                expect.objectContaining({
                    tableName: "doctor_availability",
                    columnName: "doctor_id",
                    referencedTableName: "doctors",
                    referencedColumnName: "id",
                    deleteRule: "RESTRICT",
                    updateRule: "CASCADE",
                }),
                expect.objectContaining({
                    tableName: "doctor_schedule_exceptions",
                    columnName: "doctor_id",
                    referencedTableName: "doctors",
                    referencedColumnName: "id",
                    deleteRule: "RESTRICT",
                    updateRule: "CASCADE",
                }),
                expect.objectContaining({
                    tableName: "doctor_schedule_exceptions",
                    columnName: "created_by",
                    referencedTableName: "users",
                    referencedColumnName: "id",
                    deleteRule: "SET NULL",
                    updateRule: "CASCADE",
                }),

                expect.objectContaining({
                    tableName: "notification_preferences",
                    columnName: "patient_id",
                    referencedTableName: "patients",
                    referencedColumnName: "id",
                    deleteRule: "RESTRICT",
                    updateRule: "CASCADE",
                }),
                expect.objectContaining({
                    tableName: "notifications",
                    columnName: "patient_id",
                    referencedTableName: "patients",
                    referencedColumnName: "id",
                    deleteRule: "RESTRICT",
                    updateRule: "CASCADE",
                }),
                expect.objectContaining({
                    tableName: "notifications",
                    columnName: "appointment_id",
                    referencedTableName: "appointments",
                    referencedColumnName: "id",
                    deleteRule: "SET NULL",
                    updateRule: "CASCADE",
                }),

                expect.objectContaining({
                    tableName: "audit_logs",
                    columnName: "actor_user_id",
                    referencedTableName: "users",
                    referencedColumnName: "id",
                    deleteRule: "SET NULL",
                    updateRule: "CASCADE",
                }),

                expect.objectContaining({
                    tableName: "consultations",
                    columnName: "appointment_id",
                    referencedTableName: "appointments",
                    referencedColumnName: "id",
                    deleteRule: "RESTRICT",
                    updateRule: "CASCADE",
                }),
                expect.objectContaining({
                    tableName: "consultations",
                    columnName: "doctor_id",
                    referencedTableName: "doctors",
                    referencedColumnName: "id",
                    deleteRule: "RESTRICT",
                    updateRule: "CASCADE",
                }),
                expect.objectContaining({
                    tableName: "diagnoses",
                    columnName: "consultation_id",
                    referencedTableName: "consultations",
                    referencedColumnName: "id",
                    deleteRule: "RESTRICT",
                    updateRule: "CASCADE",
                }),
                expect.objectContaining({
                    tableName: "prescriptions",
                    columnName: "consultation_id",
                    referencedTableName: "consultations",
                    referencedColumnName: "id",
                    deleteRule: "RESTRICT",
                    updateRule: "CASCADE",
                }),
                expect.objectContaining({
                    tableName: "prescription_items",
                    columnName: "prescription_id",
                    referencedTableName: "prescriptions",
                    referencedColumnName: "id",
                    deleteRule: "RESTRICT",
                    updateRule: "CASCADE",
                }),

                expect.objectContaining({
                    tableName: "emergency_contacts",
                    columnName: "patient_id",
                    referencedTableName: "patients",
                    referencedColumnName: "id",
                    deleteRule: "CASCADE",
                    updateRule: "CASCADE",
                }),
                expect.objectContaining({
                    tableName: "password_reset_tokens",
                    columnName: "user_id",
                    referencedTableName: "users",
                    referencedColumnName: "id",
                    deleteRule: "CASCADE",
                    updateRule: "CASCADE",
                }),
            ]),
        );
    });

    test("appointment_history table contains its expected columns", async () => {
        // Read the columns created by the database migration.
        const columns = await getTableColumns("appointment_history");

        // Verify that every required column exists.
        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "appointment_id",
                "actor_user_id",
                "actor_snapshot",
                "event_type",
                "previous_values",
                "new_values",
                "reason",
                "occurred_at",
            ]),
        );
    });

    test("audit_logs table contains its expected columns", async () => {
        const columns = await getTableColumns("audit_logs");

        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "actor_user_id",
                "actor_snapshot",
                "action",
                "target_type",
                "target_id",
                "target_description",
                "changes",
                "reason",
                "result",
                "occurred_at",
            ]),
        );
    });

    test("whatsapp_conversations table contains its expected columns", async () => {
        const columns = await getTableColumns("whatsapp_conversations");

        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "patient_id",
                "provider_name",
                "provider_account_id",
                "provider_conversation_id",
                "status",
                "started_at",
                "last_activity_at",
                "ended_at",
                "created_at",
                "updated_at",
            ]),
        );
    });

    test("whatsapp_messages table contains its expected columns", async () => {
        const columns = await getTableColumns("whatsapp_messages");

        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "conversation_id",
                "provider_message_id",
                "direction",
                "message_type",
                "content",
                "processing_status",
                "delivery_status",
                "received_at",
                "processed_at",
                "content_expires_at",
                "created_at",
                "provider_name",
                "provider_account_id",
            ]),
        );
    });

    test("consultations table contains its expected columns", async () => {
        const columns = await getTableColumns("consultations");

        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "appointment_id",
                "doctor_id",
                "started_at",
                "ended_at",
                "duration_seconds",
                "symptoms",
                "patient_feeling",
                "vital_signs",
                "clinical_notes",
                "created_at",
                "updated_at",
                "status",
                "interruption_reason",
            ]),
        );
    });

    test("diagnoses table contains its expected columns", async () => {
        const columns = await getTableColumns("diagnoses");

        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "consultation_id",
                "diagnosis",
                "notes",
                "created_at",
                "updated_at",
            ]),
        );
    });

    test("prescriptions table contains its expected columns", async () => {
        const columns = await getTableColumns("prescriptions");

        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "consultation_id",
                "issued_at",
                "notes",
                "created_at",
                "updated_at",
            ]),
        );
    });

    test("prescription_items table contains its expected columns", async () => {
        const columns = await getTableColumns("prescription_items");

        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "prescription_id",
                "medication_name",
                "dosage",
                "frequency",
                "duration",
                "instructions",
                "created_at",
                "updated_at",
            ]),
        );
    });

    test("emergency_contacts table contains its expected columns", async () => {
        const columns = await getTableColumns("emergency_contacts");

        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "patient_id",
                "first_name",
                "last_name",
                "phone",
                "email",
                "relationship",
                "created_at",
                "updated_at",
            ]),
        );
    });

    test("password_reset_tokens table contains its expected columns", async () => {
        const columns = await getTableColumns("password_reset_tokens");

        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "user_id",
                "token_hash",
                "expires_at",
                "used_at",
                "created_at",
            ]),
        );
    });
});
