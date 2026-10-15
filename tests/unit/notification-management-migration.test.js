
import {
    jest,
    describe,
    test,
    expect,
    beforeEach,
} from "@jest/globals";

import {
    up,
    down,
} from "../../database/migrations/20261015024047-create-notification-management-tables.js";

// Verify the notification migration creates the expected tables and constraints.
describe("Notification management migration", () => {
    let queryInterface;
    let Sequelize;

    beforeEach(() => {
        // Mock database operations to avoid modifying the real database.
        queryInterface = {
            createTable: jest.fn().mockResolvedValue(undefined),
            addConstraint: jest.fn().mockResolvedValue(undefined),
            addIndex: jest.fn().mockResolvedValue(undefined),
            dropTable: jest.fn().mockResolvedValue(undefined),
        };

        // Provide the Sequelize data types required by this migration.
        Sequelize = {
            INTEGER: Object.assign(() => "INTEGER", {
                UNSIGNED: "INTEGER UNSIGNED",
            }),
            STRING: (length) => `VARCHAR(${length})`,
            DATE: "DATETIME",
            BOOLEAN: "BOOLEAN",
            TEXT: "TEXT",
            ENUM: (...values) => ({ type: "ENUM", values }),
        };
    });

    test("up creates preferences before notifications", async () => {
        await up(queryInterface, Sequelize);

        // Create the referenced preferences table before notification records.
        expect(queryInterface.createTable.mock.calls.map(([table]) => table)).toEqual([
            "notification_preferences",
            "notifications",
        ]);
    });

    test("preferences reference patients and prevent duplicate preferences", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "notification_preferences",
        );

        // Each preference belongs to a patient and identifies its channel and event.
        expect(columns.patient_id.allowNull).toBe(false);
        expect(columns.patient_id.references).toEqual({
            model: "patients",
            key: "id",
        });
        expect(columns.patient_id.onDelete).toBe("RESTRICT");
        expect(columns.channel.type).toEqual({
            type: "ENUM",
            values: ["Email", "SMS", "WhatsApp"],
        });
        expect(columns.event_type.allowNull).toBe(false);
        expect(columns.is_enabled.defaultValue).toBe(true);

        // A patient cannot have duplicate preferences for the same channel and event.
        expect(queryInterface.addConstraint).toHaveBeenCalledWith(
            "notification_preferences",
            expect.objectContaining({
                fields: ["patient_id", "channel", "event_type"],
                type: "unique",
                name: "notification_preferences_patient_channel_event_unique",
            }),
        );
    });

    test("notifications define patient and optional appointment references", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "notifications",
        );

        // Patient history is preserved; an optional appointment can be detached.
        expect(columns.patient_id.allowNull).toBe(false);
        expect(columns.patient_id.references).toEqual({
            model: "patients",
            key: "id",
        });
        expect(columns.patient_id.onDelete).toBe("RESTRICT");

        expect(columns.appointment_id.allowNull).toBe(true);
        expect(columns.appointment_id.references).toEqual({
            model: "appointments",
            key: "id",
        });
        expect(columns.appointment_id.onDelete).toBe("SET NULL");
    });

    test("notifications have the supported channels and delivery statuses", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "notifications",
        );

        // Keep the channel and status values aligned with the database design.
        expect(columns.channel.type).toEqual({
            type: "ENUM",
            values: ["Email", "SMS", "WhatsApp"],
        });
        expect(columns.status.type).toEqual({
            type: "ENUM",
            values: ["Pending", "Processing", "Sent", "Failed", "Cancelled"],
        });
        expect(columns.status.defaultValue).toBe("Pending");
        expect(columns.status.allowNull).toBe(false);
    });

    test("notifications define delivery tracking fields", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "notifications",
        );

        // Track delivery attempts without requiring a provider response in advance.
        expect(columns.recipient_address.allowNull).toBe(false);
        expect(columns.scheduled_at.allowNull).toBe(false);
        expect(columns.sent_at.allowNull).toBe(true);
        expect(columns.attempt_count.defaultValue).toBe(0);
        expect(columns.attempt_count.allowNull).toBe(false);
        expect(columns.provider_message_id.allowNull).toBe(true);
        expect(columns.last_error.allowNull).toBe(true);
    });

    test("up adds indexes for patient, appointment and pending queue lookups", async () => {
        await up(queryInterface, Sequelize);

        // Indexes support common notification history and scheduling queries.
        expect(queryInterface.addIndex.mock.calls).toEqual([
            [
                "notifications",
                ["patient_id"],
                { name: "notifications_patient_id_index" },
            ],
            [
                "notifications",
                ["appointment_id"],
                { name: "notifications_appointment_id_index" },
            ],
            [
                "notifications",
                ["status", "scheduled_at"],
                { name: "notifications_status_scheduled_at_index" },
            ],
        ]);
    });

    test("down drops notifications before preferences", async () => {
        await down(queryInterface);

        // Drop dependent records before the table containing patient preferences.
        expect(queryInterface.dropTable.mock.calls).toEqual([
            ["notifications"],
            ["notification_preferences"],
        ]);
    });
});
