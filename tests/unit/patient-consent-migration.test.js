import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { down, up } from "../../database/migrations/20261113100000-create-patient-consents.js";

describe("patient consent evidence migration", () => {
    let queryInterface;
    let createdTable;
    let Sequelize;

    beforeEach(() => {
        createdTable = null;
        Sequelize = {
            INTEGER: { UNSIGNED: "INTEGER UNSIGNED" },
            STRING: jest.fn((length) => `VARCHAR(${length})`),
            DATE: "DATETIME",
        };
        queryInterface = {
            createTable: jest.fn(async (tableName, columns) => {
                createdTable = { tableName, columns };
            }),
            addIndex: jest.fn(),
            dropTable: jest.fn(),
        };
    });

    test("creates a minimal account-linked consent record", async () => {
        await up(queryInterface, Sequelize);

        expect(createdTable.tableName).toBe("patient_consents");
        expect(Object.keys(createdTable.columns)).toEqual([
            "id",
            "user_id",
            "consent_scope",
            "notice_version",
            "accepted_at",
        ]);
        expect(createdTable.columns.user_id).toMatchObject({
            allowNull: false,
            references: { model: "users", key: "id" },
            onDelete: "RESTRICT",
        });
        expect(createdTable.columns.accepted_at).toMatchObject({
            type: "DATETIME",
            allowNull: false,
        });
        expect(queryInterface.addIndex).toHaveBeenCalledWith(
            "patient_consents",
            ["user_id", "accepted_at"],
            { name: "patient_consents_user_accepted_index" },
        );
    });

    test("rolls back only the added consent table", async () => {
        await down(queryInterface);

        expect(queryInterface.dropTable).toHaveBeenCalledTimes(1);
        expect(queryInterface.dropTable).toHaveBeenCalledWith("patient_consents");
    });
});
