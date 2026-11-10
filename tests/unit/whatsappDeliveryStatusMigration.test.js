import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import {
    down,
    up,
} from "../../database/migrations/20261110140000-add-whatsapp-delivery-status-timestamps.js";

describe("WhatsApp delivery timestamp migration", () => {
    let queryInterface;
    let transaction;

    beforeEach(() => {
        transaction = { commit: jest.fn(), rollback: jest.fn() };
        queryInterface = {
            sequelize: { transaction: jest.fn().mockResolvedValue(transaction) },
            addColumn: jest.fn().mockResolvedValue(undefined),
            removeColumn: jest.fn().mockResolvedValue(undefined),
        };
    });

    test("adds nullable provider callback timestamps to both records", async () => {
        await up(queryInterface, { DATE: "DATE" });

        expect(queryInterface.addColumn).toHaveBeenNthCalledWith(
            1,
            "whatsapp_messages",
            "delivery_status_at",
            { type: "DATE", allowNull: true },
            { transaction },
        );
        expect(queryInterface.addColumn).toHaveBeenNthCalledWith(
            2,
            "notifications",
            "provider_delivery_status_at",
            { type: "DATE", allowNull: true },
            { transaction },
        );
        expect(transaction.commit).toHaveBeenCalledTimes(1);
    });

    test("removes only the two added timestamp columns on rollback", async () => {
        await down(queryInterface);

        expect(queryInterface.removeColumn).toHaveBeenNthCalledWith(
            1,
            "notifications",
            "provider_delivery_status_at",
            { transaction },
        );
        expect(queryInterface.removeColumn).toHaveBeenNthCalledWith(
            2,
            "whatsapp_messages",
            "delivery_status_at",
            { transaction },
        );
        expect(transaction.commit).toHaveBeenCalledTimes(1);
    });

    test("rolls back the schema transaction when an update fails", async () => {
        queryInterface.addColumn.mockRejectedValueOnce(new Error("migration failure"));

        await expect(up(queryInterface, { DATE: "DATE" })).rejects.toThrow("migration failure");

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(transaction.commit).not.toHaveBeenCalled();
    });
});
