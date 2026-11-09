import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import {
    down,
    up,
} from "../../database/migrations/20261109120000-add-uncertain-notification-outcome.js";

describe("uncertain notification outcome migration", () => {
    let queryInterface;
    let Sequelize;

    beforeEach(() => {
        queryInterface = {
            changeColumn: jest.fn().mockResolvedValue(undefined),
            sequelize: {
                query: jest.fn().mockResolvedValue([[{ count: 0 }], []]),
            },
        };
        Sequelize = { ENUM: (...values) => ({ type: "ENUM", values }) };
    });

    test("adds the explicit uncertain outcome without changing other statuses", async () => {
        await up(queryInterface, Sequelize);

        expect(queryInterface.changeColumn).toHaveBeenCalledWith(
            "notifications",
            "status",
            expect.objectContaining({
                type: {
                    type: "ENUM",
                    values: [
                        "Pending",
                        "Processing",
                        "Sent",
                        "Failed",
                        "Cancelled",
                        "OutcomeUnknown",
                    ],
                },
                defaultValue: "Pending",
            }),
        );
    });

    test("refuses to remove the status while uncertain records still exist", async () => {
        queryInterface.sequelize.query.mockResolvedValue([[{ count: 1 }], []]);

        await expect(down(queryInterface, Sequelize)).rejects.toThrow(
            "Resolve OutcomeUnknown notifications before reverting this migration.",
        );
        expect(queryInterface.changeColumn).not.toHaveBeenCalled();
    });

    test("removes the status only after all uncertain records are resolved", async () => {
        await down(queryInterface, Sequelize);

        expect(queryInterface.sequelize.query).toHaveBeenCalledWith(
            "SELECT COUNT(*) AS count FROM notifications WHERE status = :status",
            { replacements: { status: "OutcomeUnknown" } },
        );
        expect(queryInterface.changeColumn).toHaveBeenCalledWith(
            "notifications",
            "status",
            expect.objectContaining({
                type: {
                    type: "ENUM",
                    values: ["Pending", "Processing", "Sent", "Failed", "Cancelled"],
                },
            }),
        );
    });
});
