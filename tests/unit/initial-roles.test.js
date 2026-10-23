import { jest, describe, test, expect, beforeEach } from "@jest/globals";
import { up } from "../../database/seeders/20261014230143-initial-roles.js";

// Mock the database interface so these tests do not require a live MySQL server.
describe("Initial roles seeder", () => {
    let queryInterface;
    let existingRoles;
    let insertedRoles;

    beforeEach(() => {
        existingRoles = [];
        insertedRoles = [];

        queryInterface = {
            sequelize: {
                QueryTypes: { SELECT: "SELECT" },
                query: jest.fn(async (_sql, options) =>
                    existingRoles.filter((role) => role.name === options.replacements.name),
                ),
            },
            bulkInsert: jest.fn(async (_table, rows) => {
                insertedRoles.push(...rows);
            }),
        };
    });

    test("inserts Patient, Doctor, and Administrator", async () => {
        await up(queryInterface);

        expect(insertedRoles.map((role) => role.name)).toEqual([
            "Patient",
            "Doctor",
            "Administrator",
        ]);

        expect(insertedRoles).toHaveLength(3);
        expect(insertedRoles.every((role) => role.created_at instanceof Date)).toBe(true);
        expect(insertedRoles.every((role) => role.updated_at instanceof Date)).toBe(true);
    });

    test("does not insert roles that already exist", async () => {
        existingRoles = [{ name: "Patient" }, { name: "Doctor" }, { name: "Administrator" }];

        await up(queryInterface);

        expect(queryInterface.bulkInsert).not.toHaveBeenCalled();
    });

    test("inserts only missing roles", async () => {
        existingRoles = [{ name: "Patient" }];

        await up(queryInterface);

        expect(insertedRoles.map((role) => role.name)).toEqual(["Doctor", "Administrator"]);
    });
});
