import { describe, expect, jest, test } from "@jest/globals";
import {
    down,
    up,
} from "../../database/migrations/20261027220000-add-admin-notification-preference.js";

describe("administrator notification preference migration", () => {
    test("adds an enabled-by-default preference to existing user records", async () => {
        const queryInterface = { addColumn: jest.fn() };
        const Sequelize = { BOOLEAN: "BOOLEAN" };

        await up(queryInterface, Sequelize);

        expect(queryInterface.addColumn).toHaveBeenCalledWith(
            "users",
            "admin_notifications_enabled",
            { type: "BOOLEAN", allowNull: false, defaultValue: true },
        );
    });

    test("removes the preference when rolled back", async () => {
        const queryInterface = { removeColumn: jest.fn() };

        await down(queryInterface);

        expect(queryInterface.removeColumn).toHaveBeenCalledWith(
            "users",
            "admin_notifications_enabled",
        );
    });
});
