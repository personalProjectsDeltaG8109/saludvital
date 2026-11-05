import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import {
    down,
    up,
} from "../../database/migrations/20261104100000-add-no-show-appointment-status.js";

describe("no-show appointment status migration", () => {
    let transaction;
    let queryInterface;

    beforeEach(() => {
        transaction = { commit: jest.fn(), rollback: jest.fn() };
        queryInterface = {
            sequelize: {
                transaction: jest.fn().mockResolvedValue(transaction),
                query: jest.fn(),
            },
            bulkInsert: jest.fn().mockResolvedValue(undefined),
            bulkDelete: jest.fn().mockResolvedValue(undefined),
        };
    });

    test("adds the status when it does not exist", async () => {
        queryInterface.sequelize.query.mockResolvedValue([[]]);

        await up(queryInterface);

        expect(queryInterface.bulkInsert).toHaveBeenCalledWith(
            "appointment_statuses",
            [expect.objectContaining({ name: "No Show" })],
            { transaction },
        );
        expect(transaction.commit).toHaveBeenCalled();
    });

    test("does not duplicate an existing status", async () => {
        queryInterface.sequelize.query.mockResolvedValue([[{ id: 5 }]]);

        await up(queryInterface);

        expect(queryInterface.bulkInsert).not.toHaveBeenCalled();
        expect(transaction.commit).toHaveBeenCalled();
    });

    test("does not remove a status that is referenced by appointments", async () => {
        queryInterface.sequelize.query.mockResolvedValue([[{ id: 10 }]]);

        await expect(down(queryInterface)).rejects.toThrow(/appointments use it/);
        expect(queryInterface.bulkDelete).not.toHaveBeenCalled();
    });

    test("removes an unused status during rollback", async () => {
        queryInterface.sequelize.query.mockResolvedValue([[]]);

        await down(queryInterface);

        expect(queryInterface.bulkDelete).toHaveBeenCalledWith("appointment_statuses", {
            name: "No Show",
        });
    });
});
