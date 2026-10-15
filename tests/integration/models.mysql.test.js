
import {
    beforeAll,
    afterAll,
    describe,
    test,
    expect,
} from "@jest/globals";

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
        const columns = await database
            .getQueryInterface()
            .describeTable(tableName);

        return Object.keys(columns);
    }

    test("roles table contains its expected columns", async () => {
        const columns = await getTableColumns("roles");

        expect(columns).toEqual(
            expect.arrayContaining([
                "id",
                "name",
                "description",
                "created_at",
                "updated_at",
            ]),
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

    test("registered associations use the expected foreign keys", () => {
        const { Rol, User, Patient, Doctor, Specialities } =
            database.models;

        expect(Rol.associations.usuarios.foreignKey).toBe("role_id");
        expect(User.associations.patient.foreignKey).toBe("user_id");
        expect(User.associations.doctor.foreignKey).toBe("user_id");
        expect(Doctor.associations.specialty.foreignKey).toBe("specialty_id");
        expect(Patient.associations.user.target).toBe(User);
        expect(Specialities.associations.doctors.target).toBe(Doctor);
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
                )
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
            ]),
        );
    });

});
