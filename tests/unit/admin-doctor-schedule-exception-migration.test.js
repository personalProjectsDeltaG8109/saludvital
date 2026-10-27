import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import {
    down,
    up,
} from "../../database/migrations/20261024120000-add-active-state-to-doctor-schedule-exceptions.js";

describe("doctor schedule exception active-state migration", () => {
    let queryInterface;
    let addedColumns;
    let removedColumns;
    const Sequelize = { BOOLEAN: "BOOLEAN", DATE: "DATETIME" };

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

    test("adds an active flag defaulting existing exception records to active", async () => {
        await up(queryInterface, Sequelize);

        expect(addedColumns).toEqual([
            {
                table: "doctor_schedule_exceptions",
                column: "is_active",
                definition: { type: "BOOLEAN", allowNull: false, defaultValue: true },
            },
            {
                table: "doctor_schedule_exceptions",
                column: "updated_at",
                definition: { type: "DATETIME", allowNull: true },
            },
        ]);
    });

    test("removes only the new columns on rollback", async () => {
        await down(queryInterface);

        expect(removedColumns).toEqual([
            { table: "doctor_schedule_exceptions", column: "updated_at" },
            { table: "doctor_schedule_exceptions", column: "is_active" },
        ]);
    });
});
