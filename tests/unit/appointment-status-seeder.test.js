import { jest, describe, test, expect, beforeEach } from "@jest/globals";
import { up, down } from "../../database/seeders/20261015022211-initial-appointment-statuses.js";

// Verify the initial appointment statuses are inserted safely and without duplicates.
describe("Initial appointment statuses seeder", () => {
    let queryInterface;

    beforeEach(() => {
        // Simulate Sequelize's query interface without connecting to MySQL.
        queryInterface = {
            sequelize: {
                query: jest.fn(),
            },
            bulkInsert: jest.fn().mockResolvedValue(undefined),
        };
    });

    test("inserts all four statuses when the catalog is empty", async () => {
        // Simulate an empty appointment status catalog.
        queryInterface.sequelize.query.mockResolvedValue([[]]);

        await up(queryInterface);

        // Confirm that exactly the four expected statuses are inserted.
        expect(queryInterface.bulkInsert).toHaveBeenCalledTimes(1);

        const [tableName, insertedStatuses] = queryInterface.bulkInsert.mock.calls[0];

        expect(tableName).toBe("appointment_statuses");
        expect(insertedStatuses.map((status) => status.name)).toEqual([
            "Pending",
            "In Progress",
            "Completed",
            "Cancelled",
        ]);

        // Every inserted record must include the audit timestamps.
        for (const status of insertedStatuses) {
            expect(status.created_at).toBeInstanceOf(Date);
            expect(status.updated_at).toBeInstanceOf(Date);
        }
    });

    test("inserts only statuses that are missing", async () => {
        // Simulate a catalog where Pending and Completed already exist.
        queryInterface.sequelize.query.mockResolvedValue([
            [{ name: "Pending" }, { name: "Completed" }],
        ]);

        await up(queryInterface);

        // Only In Progress and Cancelled should be added.
        const [, insertedStatuses] = queryInterface.bulkInsert.mock.calls[0];

        expect(insertedStatuses.map((status) => status.name)).toEqual(["In Progress", "Cancelled"]);
    });

    test("does not insert records when all statuses already exist", async () => {
        // Simulate a catalog that already contains all four statuses.
        queryInterface.sequelize.query.mockResolvedValue([
            [
                { name: "Pending" },
                { name: "In Progress" },
                { name: "Completed" },
                { name: "Cancelled" },
            ],
        ]);

        await up(queryInterface);

        // No insertion is necessary when the catalog is complete.
        expect(queryInterface.bulkInsert).not.toHaveBeenCalled();
    });

    test("does not delete status records when the seeder is reverted", async () => {
        // Reverting the seeder must preserve statuses referenced by appointments.
        await down(queryInterface);

        expect(queryInterface.bulkInsert).not.toHaveBeenCalled();
        expect(queryInterface.sequelize.query).not.toHaveBeenCalled();
    });
});
