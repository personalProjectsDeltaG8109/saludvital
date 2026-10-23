import { jest, describe, test, expect, beforeEach } from "@jest/globals";
import {
    up,
    down,
} from "../../database/migrations/20261015010248-create-patient-and-doctor-tables.js";

// Test the patient and doctor migration without connecting to MySQL.
describe("Patient and doctor database migration", () => {
    let queryInterface;
    let createdTables;
    let droppedTables;
    let constraints;
    let Sequelize;

    beforeEach(() => {
        createdTables = [];
        droppedTables = [];
        constraints = [];

        // Mock the Sequelize data types used by this migration.
        Sequelize = {
            INTEGER: { UNSIGNED: "INTEGER UNSIGNED" },
            STRING: jest.fn((length) => `VARCHAR(${length})`),
            DATE: "DATETIME",
            DATEONLY: "DATE",
            ENUM: jest.fn((...values) => ({ enumValues: values })),
            TEXT: "TEXT",
        };

        // Capture migration operations instead of changing a real database.
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

    test("creates patients and doctors in dependency order", async () => {
        await up(queryInterface, Sequelize);

        expect(createdTables.map(({ tableName }) => tableName)).toEqual(["patients", "doctors"]);
    });

    test("allows patients without a web account", async () => {
        await up(queryInterface, Sequelize);

        const patients = createdTables.find(({ tableName }) => tableName === "patients");

        expect(patients.columns.user_id).toMatchObject({
            allowNull: true,
            unique: true,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        });
    });

    test("requires patient identity fields and restricts document types", async () => {
        await up(queryInterface, Sequelize);

        const patients = createdTables.find(({ tableName }) => tableName === "patients");

        expect(patients.columns.first_name.allowNull).toBe(false);
        expect(patients.columns.last_name.allowNull).toBe(false);
        expect(patients.columns.document_number.allowNull).toBe(false);
        expect(patients.columns.document_type).toMatchObject({
            type: { enumValues: ["CC", "CE"] },
            allowNull: false,
        });
    });

    test("enforces uniqueness of patient document type and number", async () => {
        await up(queryInterface, Sequelize);

        expect(constraints).toContainEqual({
            tableName: "patients",
            fields: ["document_type", "document_number"],
            type: "unique",
            name: "patients_document_type_number_unique",
        });
    });

    test("requires each doctor to reference a unique user and an existing specialty", async () => {
        await up(queryInterface, Sequelize);

        const doctors = createdTables.find(({ tableName }) => tableName === "doctors");

        expect(doctors.columns.user_id).toMatchObject({
            allowNull: false,
            unique: true,
            references: { model: "users", key: "id" },
            onDelete: "RESTRICT",
        });

        expect(doctors.columns.specialty_id).toMatchObject({
            allowNull: false,
            references: { model: "specialties", key: "id" },
            onDelete: "RESTRICT",
        });
    });

    test("drops doctor and patient tables in reverse dependency order", async () => {
        await down(queryInterface);

        expect(droppedTables).toEqual(["doctors", "patients"]);
    });
});
