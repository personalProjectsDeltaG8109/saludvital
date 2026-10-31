import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { down, up } from "../../../database/migrations/20261030120000-expand-user-email-to-320.js";

describe("user email length migration", () => {
    const Sequelize = { STRING: (length) => `STRING(${length})` };
    let queryInterface;

    beforeEach(() => {
        queryInterface = {
            changeColumn: jest.fn(),
            sequelize: { query: jest.fn() },
        };
    });

    test("expands the account email column to 320 characters", async () => {
        await up(queryInterface, Sequelize);

        expect(queryInterface.changeColumn).toHaveBeenCalledWith("users", "email", {
            type: "STRING(320)",
            allowNull: false,
        });
    });

    test("refuses to shrink the column when longer emails exist", async () => {
        queryInterface.sequelize.query.mockResolvedValue([[{ 1: 1 }]]);

        await expect(down(queryInterface, Sequelize)).rejects.toThrow(
            "Cannot shrink users.email while longer email addresses exist.",
        );
        expect(queryInterface.changeColumn).not.toHaveBeenCalled();
    });

    test("restores the prior width when no email would be truncated", async () => {
        queryInterface.sequelize.query.mockResolvedValue([[]]);

        await down(queryInterface, Sequelize);

        expect(queryInterface.changeColumn).toHaveBeenCalledWith("users", "email", {
            type: "STRING(100)",
            allowNull: false,
        });
    });
});
