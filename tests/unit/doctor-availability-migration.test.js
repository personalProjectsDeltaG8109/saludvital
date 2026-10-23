import { jest, describe, test, expect, beforeEach } from "@jest/globals";
import {
    up,
    down,
} from "../../database/migrations/20261015015131-create-doctor-availability-and-schedule-exceptions.js";

// Test the schedule migration without connecting to MySQL.
describe("Doctor availability and schedule exceptions migration", () => {
    let queryInterface;
    let createdTables;
    let droppedTables;
    let constraints;
    let Sequelize;

    beforeEach(() => {
        createdTables = [];
        droppedTables = [];
        constraints = [];

        // Mock the Sequelize data types and SQL literal helper.
        Sequelize = {
            INTEGER: { UNSIGNED: "INTEGER UNSIGNED" },
            TINYINT: { UNSIGNED: "TINYINT UNSIGNED" },
            TIME: "TIME",
            DATE: "DATETIME",
            DATEONLY: "DATE",
            BOOLEAN: "BOOLEAN",
            STRING: jest.fn((length) => `VARCHAR(${length})`),
            ENUM: jest.fn((...values) => ({ enumValues: values })),
            literal: jest.fn((sql) => ({ sql })),
        };

        // Capture migration operations instead of modifying a real database.
        queryInterface = {
            createTable: jest.fn(async (tableName, columns) => {
                createdTables.push({ tableName, columns });
            }),
            addConstraint: jest.fn(async (tableName, options) => {
                constraints.push({ tableName, ...options });
            }),
            dropTable: jest.fn(async (tableName) => {
                droppedTables.push(tableName);
            }),
        };
    });

    test("creates availability before schedule exceptions", async () => {
        await up(queryInterface, Sequelize);

        expect(createdTables.map(({ tableName }) => tableName)).toEqual([
            "doctor_availability",
            "doctor_schedule_exceptions",
        ]);
    });

    test("requires valid weekly availability fields and an existing doctor", async () => {
        await up(queryInterface, Sequelize);

        const availability = createdTables.find(
            ({ tableName }) => tableName === "doctor_availability",
        );

        expect(availability.columns.doctor_id).toMatchObject({
            allowNull: false,
            references: { model: "doctors", key: "id" },
            onDelete: "RESTRICT",
        });

        expect(availability.columns.day_of_week.allowNull).toBe(false);
        expect(availability.columns.start_time.allowNull).toBe(false);
        expect(availability.columns.end_time.allowNull).toBe(false);
        expect(availability.columns.valid_from.allowNull).toBe(false);
        expect(availability.columns.valid_until.allowNull).toBe(true);
        expect(availability.columns.is_active.defaultValue).toBe(true);
    });

    test("adds checks for weekdays, business hours, and validity dates", async () => {
        await up(queryInterface, Sequelize);

        expect(constraints).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    tableName: "doctor_availability",
                    type: "check",
                    name: "doctor_availability_day_of_week_check",
                }),
                expect.objectContaining({
                    tableName: "doctor_availability",
                    type: "check",
                    name: "doctor_availability_business_hours_check",
                }),
                expect.objectContaining({
                    tableName: "doctor_availability",
                    type: "check",
                    name: "doctor_availability_valid_dates_check",
                }),
            ]),
        );
    });

    test("requires exception intervals and records their actor", async () => {
        await up(queryInterface, Sequelize);

        const exceptions = createdTables.find(
            ({ tableName }) => tableName === "doctor_schedule_exceptions",
        );

        expect(exceptions.columns.doctor_id).toMatchObject({
            allowNull: false,
            references: { model: "doctors", key: "id" },
            onDelete: "RESTRICT",
        });

        expect(exceptions.columns.start_at.allowNull).toBe(false);
        expect(exceptions.columns.end_at.allowNull).toBe(false);
        expect(exceptions.columns.reason.allowNull).toBe(false);
        expect(exceptions.columns.actor_snapshot.allowNull).toBe(false);
        expect(exceptions.columns.created_by).toMatchObject({
            allowNull: true,
            references: { model: "users", key: "id" },
        });

        expect(exceptions.columns.exception_type.type.enumValues).toEqual([
            "Unavailable",
            "AdditionalAvailability",
        ]);
    });

    test("adds a check requiring the exception end after its start", async () => {
        await up(queryInterface, Sequelize);

        expect(constraints).toContainEqual(
            expect.objectContaining({
                tableName: "doctor_schedule_exceptions",
                type: "check",
                name: "doctor_schedule_exceptions_time_range_check",
            }),
        );
    });

    test("drops exceptions before availability during rollback", async () => {
        await down(queryInterface);

        expect(droppedTables).toEqual(["doctor_schedule_exceptions", "doctor_availability"]);
    });
});
