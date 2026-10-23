import { jest, describe, test, expect, beforeEach } from "@jest/globals";
import { up, down } from "../../database/migrations/20261014224155-create-foundation-tables.js";

// Verify the database migration without connecting to a real MySQL server.
describe("Foundation database migration", () => {
    let queryInterface;
    let createdTables;
    let droppedTables;
    let Sequelize;

    beforeEach(() => {
        // Record table creation and deletion calls for each test.
        createdTables = [];
        droppedTables = [];

        // Mock the Sequelize data types used by the migration.
        Sequelize = {
            INTEGER: { UNSIGNED: "INTEGER UNSIGNED" },
            STRING: jest.fn((length) => `VARCHAR(${length})`),
            DATE: "DATETIME",
            BOOLEAN: "BOOLEAN",
        };

        // Mock the database interface to prevent real database changes.
        queryInterface = {
            createTable: jest.fn(async (tableName, columns) => {
                createdTables.push({ tableName, columns });
            }),
            dropTable: jest.fn(async (tableName) => {
                droppedTables.push(tableName);
            }),
        };
    });

    test("creates roles, users, and specialties", async () => {
        await up(queryInterface, Sequelize);

        // Verify that all three foundational tables are created.
        expect(createdTables.map(({ tableName }) => tableName)).toEqual([
            "roles",
            "users",
            "specialties",
        ]);
    });

    test("defines the users role foreign key correctly", async () => {
        await up(queryInterface, Sequelize);

        // Find the users table and inspect its role relationship.
        const usersTable = createdTables.find(({ tableName }) => tableName === "users");

        expect(usersTable.columns.role_id).toMatchObject({
            type: "INTEGER UNSIGNED",
            allowNull: false,
            references: {
                model: "roles",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        });
    });

    test("defines required fields and unique constraints", async () => {
        await up(queryInterface, Sequelize);

        // Verify the important constraints in the roles table.
        const rolesTable = createdTables.find(({ tableName }) => tableName === "roles");

        expect(rolesTable.columns.id).toMatchObject({
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        });
        expect(rolesTable.columns.name).toMatchObject({
            type: "VARCHAR(30)",
            allowNull: false,
            unique: true,
        });

        // Verify that user emails are required and unique.
        const usersTable = createdTables.find(({ tableName }) => tableName === "users");

        expect(usersTable.columns.email).toMatchObject({
            type: "VARCHAR(80)",
            allowNull: false,
            unique: true,
        });
    });

    test("drops tables in reverse dependency order", async () => {
        await down(queryInterface);

        // Remove dependent tables before the roles table.
        expect(droppedTables).toEqual(["specialties", "users", "roles"]);
    });
});
