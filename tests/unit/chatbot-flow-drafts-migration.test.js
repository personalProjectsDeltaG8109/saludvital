import { describe, expect, test, jest } from "@jest/globals";
import { up, down } from "../../database/migrations/20261028110000-create-chatbot-flow-drafts.js";

describe("chatbot flow draft migration", () => {
    test("creates versioned draft storage with administrator attribution", async () => {
        const queryInterface = {
            createTable: jest.fn().mockResolvedValue(undefined),
            addConstraint: jest.fn().mockResolvedValue(undefined),
            addIndex: jest.fn().mockResolvedValue(undefined),
        };
        const Sequelize = {
            INTEGER: { UNSIGNED: "UNSIGNED_INTEGER" },
            DATE: "DATE",
            STRING: jest.fn((length) => `STRING_${length}`),
            ENUM: jest.fn((...values) => ({ values })),
            JSON: "JSON",
        };

        await up(queryInterface, Sequelize);

        expect(queryInterface.createTable.mock.calls.map(([name]) => name)).toEqual([
            "chatbot_flows",
            "chatbot_flow_versions",
        ]);
        const [, columns] = queryInterface.createTable.mock.calls[1];
        expect(columns.definition.type).toBe("JSON");
        expect(columns.status.type.values).toEqual(["Draft"]);
        expect(columns.created_by.references).toEqual({ model: "users", key: "id" });
        expect(queryInterface.addConstraint).toHaveBeenCalledWith(
            "chatbot_flow_versions",
            expect.objectContaining({ fields: ["flow_id", "version_number"], type: "unique" }),
        );
    });

    test("drops versions before flow identities", async () => {
        const queryInterface = { dropTable: jest.fn().mockResolvedValue(undefined) };
        await down(queryInterface);
        expect(queryInterface.dropTable.mock.calls).toEqual([
            ["chatbot_flow_versions"],
            ["chatbot_flows"],
        ]);
    });
});
