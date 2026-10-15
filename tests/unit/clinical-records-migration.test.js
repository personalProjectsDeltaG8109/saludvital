
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
} from "../../database/migrations/20261015023101-create-clinical-records-tables.js";

// Verify the clinical migration creates the expected tables and relationships.
describe("Clinical records migration", () => {
    let queryInterface;
    let Sequelize;

    beforeEach(() => {
        // Mock database operations so tests never modify the real database.
        queryInterface = {
            createTable: jest.fn().mockResolvedValue(undefined),
            addConstraint: jest.fn().mockResolvedValue(undefined),
            removeConstraint: jest.fn().mockResolvedValue(undefined),
            dropTable: jest.fn().mockResolvedValue(undefined),
        };

        // Provide minimal Sequelize data type mocks used by this migration.
        Sequelize = {
            INTEGER: Object.assign(() => "INTEGER", {
                UNSIGNED: "INTEGER UNSIGNED",
            }),
            STRING: (length) => `VARCHAR(${length})`,
            DATE: "DATETIME",
            TEXT: "TEXT",
            JSON: "JSON",
            ENUM: (...values) => ({ type: "ENUM", values }),
            literal: (value) => value,
        };
    });

    test("up creates the four clinical tables in dependency order", async () => {
        await up(queryInterface, Sequelize);

        // Parent tables must exist before their dependent tables are created.
        expect(queryInterface.createTable.mock.calls.map(([table]) => table)).toEqual([
            "consultations",
            "diagnoses",
            "prescriptions",
            "prescription_items",
        ]);
    });

    test("a consultation can be linked to only one appointment", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "consultations",
        );

        // The unique appointment reference prevents duplicate consultations.
        expect(columns.appointment_id.unique).toBe(true);
        expect(columns.appointment_id.allowNull).toBe(false);
        expect(columns.appointment_id.references).toEqual({
            model: "appointments",
            key: "id",
        });
        expect(columns.appointment_id.onDelete).toBe("RESTRICT");
    });

    test("consultation status defaults to InProgress", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "consultations",
        );

        // Verify the supported consultation states and their default.
        expect(columns.status.type).toEqual({
            type: "ENUM",
            values: ["InProgress", "Completed", "Interrupted"],
        });
        expect(columns.status.defaultValue).toBe("InProgress");
        expect(columns.status.allowNull).toBe(false);
    });

    test("diagnoses and prescriptions reference consultations", async () => {
        await up(queryInterface, Sequelize);

        const [, diagnosisColumns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "diagnoses",
        );
        const [, prescriptionColumns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "prescriptions",
        );

        // Both clinical records must belong to an existing consultation.
        expect(diagnosisColumns.consultation_id.references).toEqual({
            model: "consultations",
            key: "id",
        });
        expect(prescriptionColumns.consultation_id.references).toEqual({
            model: "consultations",
            key: "id",
        });
        expect(diagnosisColumns.consultation_id.onDelete).toBe("RESTRICT");
        expect(prescriptionColumns.consultation_id.onDelete).toBe("RESTRICT");
    });

    test("prescription items reference their prescription", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "prescription_items",
        );

        // Medication instructions cannot exist without a prescription.
        expect(columns.prescription_id.references).toEqual({
            model: "prescriptions",
            key: "id",
        });
        expect(columns.prescription_id.onDelete).toBe("RESTRICT");
        expect(columns.medication_name.allowNull).toBe(false);
        expect(columns.dosage.allowNull).toBe(false);
    });

    test("up adds a check constraint for the consultation time range", async () => {
        await up(queryInterface, Sequelize);

        // The end time must be later than the start time when it is present.
        expect(queryInterface.addConstraint).toHaveBeenCalledWith(
            "consultations",
            expect.objectContaining({
                fields: ["ended_at", "started_at"],
                type: "check",
                name: "consultations_time_range_check",
            }),
        );
    });

    test("down removes tables in reverse dependency order", async () => {
        await down(queryInterface);

        // Drop child tables before their parents to respect foreign keys.
        expect(queryInterface.dropTable.mock.calls).toEqual([
            ["prescription_items"],
            ["prescriptions"],
            ["diagnoses"],
            ["consultations"],
        ]);

        expect(queryInterface.removeConstraint).toHaveBeenCalledWith(
            "consultations",
            "consultations_time_range_check",
        );
    });
});
