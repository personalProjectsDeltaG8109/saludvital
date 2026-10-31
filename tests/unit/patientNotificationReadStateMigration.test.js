import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import {
    down,
    up,
} from "../../database/migrations/20261031110000-add-patient-notification-read-state.js";

describe("patient notification read-state migration", () => {
    let queryInterface;

    beforeEach(() => {
        queryInterface = {
            addColumn: jest.fn().mockResolvedValue(undefined),
            removeColumn: jest.fn().mockResolvedValue(undefined),
            sequelize: { query: jest.fn().mockResolvedValue(undefined) },
        };
    });

    test("adds read_at and backfills existing history as read", async () => {
        await up(queryInterface, { DATE: "DATETIME" });

        expect(queryInterface.addColumn).toHaveBeenCalledWith("notifications", "read_at", {
            type: "DATETIME",
            allowNull: true,
        });
        expect(queryInterface.sequelize.query).toHaveBeenCalledWith(
            expect.stringContaining("COALESCE(sent_at, scheduled_at, created_at)"),
        );
    });

    test("removes only the read-state column when reverted", async () => {
        await down(queryInterface);
        expect(queryInterface.removeColumn).toHaveBeenCalledWith("notifications", "read_at");
    });
});
