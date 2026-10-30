import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import {
    down,
    up,
} from "../../database/migrations/20261029140000-add-doctor-contact-and-address-fields.js";

describe("doctor profile contact migration", () => {
    let queryInterface;
    let addedColumns;
    let removedColumns;
    const Sequelize = { STRING: (length) => `STRING(${length})` };

    beforeEach(() => {
        addedColumns = [];
        removedColumns = [];
        queryInterface = {
            addColumn: jest.fn(async (table, column, definition) => {
                addedColumns.push({ table, column, definition });
            }),
            removeColumn: jest.fn(async (table, column) => {
                removedColumns.push({ table, column });
            }),
        };
    });

    test("adds nullable doctor contact and address fields", async () => {
        await up(queryInterface, Sequelize);

        expect(addedColumns).toEqual([
            {
                table: "doctors",
                column: "alternate_phone",
                definition: { type: "STRING(20)", allowNull: true, after: "profile_photo_url" },
            },
            {
                table: "doctors",
                column: "address",
                definition: { type: "STRING(150)", allowNull: true, after: "alternate_phone" },
            },
            {
                table: "doctors",
                column: "department",
                definition: { type: "STRING(100)", allowNull: true, after: "address" },
            },
            {
                table: "doctors",
                column: "municipality",
                definition: { type: "STRING(100)", allowNull: true, after: "department" },
            },
        ]);
    });

    test("removes only the columns introduced by this migration", async () => {
        await down(queryInterface);

        expect(removedColumns).toEqual([
            { table: "doctors", column: "municipality" },
            { table: "doctors", column: "department" },
            { table: "doctors", column: "address" },
            { table: "doctors", column: "alternate_phone" },
        ]);
    });
});
