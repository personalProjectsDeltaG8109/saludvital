import { jest, describe, test, expect, beforeEach } from "@jest/globals";
import {
    up,
    down,
} from "../../database/migrations/20261015021350-create-appointment-management-tables.js";

// Verify the appointment migration creates and removes tables in the correct order.
describe("Appointment management migration", () => {
    let queryInterface;
    let Sequelize;

    beforeEach(() => {
        // Mock database operations so tests never modify the real database.
        queryInterface = {
            createTable: jest.fn().mockResolvedValue(undefined),
            addConstraint: jest.fn().mockResolvedValue(undefined),
            dropTable: jest.fn().mockResolvedValue(undefined),
        };

        // Provide the Sequelize data types and literal function used by the migration.
        Sequelize = {
            INTEGER: Object.assign(() => "INTEGER", {
                UNSIGNED: "INTEGER UNSIGNED",
            }),
            STRING: (length) => `VARCHAR(${length})`,
            DATE: "DATETIME",
            ENUM: (...values) => ({ type: "ENUM", values }),
            JSON: "JSON",
            literal: (value) => value,
        };
    });

    test("up creates the three tables in dependency order", async () => {
        await up(queryInterface, Sequelize);

        expect(queryInterface.createTable).toHaveBeenCalledTimes(3);

        expect(queryInterface.createTable.mock.calls.map(([table]) => table)).toEqual([
            "appointment_statuses",
            "appointments",
            "appointment_history",
        ]);
    });

    test("appointments has the required foreign keys and source values", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "appointments",
        );

        expect(columns.patient_id.references).toEqual({
            model: "patients",
            key: "id",
        });
        expect(columns.doctor_id.references).toEqual({
            model: "doctors",
            key: "id",
        });
        expect(columns.specialty_id.references).toEqual({
            model: "specialties",
            key: "id",
        });
        expect(columns.status_id.references).toEqual({
            model: "appointment_statuses",
            key: "id",
        });
        // Verify the ENUM type and the allowed appointment sources.
        expect(columns.source.allowNull).toBe(false);

        expect(columns.source.type).toEqual({
            type: "ENUM",
            values: ["Web", "WhatsApp", "Admin"],
        });
    });

    test("appointment history allows a deleted actor account to be set to null", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "appointment_history",
        );

        expect(columns.actor_user_id.allowNull).toBe(true);
        expect(columns.actor_user_id.onDelete).toBe("SET NULL");
        expect(columns.actor_snapshot.allowNull).toBe(false);
        expect(columns.previous_values.type).toBe("JSON");
        expect(columns.new_values.type).toBe("JSON");
    });

    test("up adds a constraint requiring the appointment end to follow its start", async () => {
        await up(queryInterface, Sequelize);

        expect(queryInterface.addConstraint).toHaveBeenCalledWith(
            "appointments",
            expect.objectContaining({
                fields: ["end_at", "start_at"],
                type: "check",
                name: "appointments_time_range_check",
            }),
        );
    });

    test("down removes tables in reverse dependency order", async () => {
        await down(queryInterface);

        expect(queryInterface.dropTable.mock.calls).toEqual([
            ["appointment_history"],
            ["appointments"],
            ["appointment_statuses"],
        ]);
    });
});
