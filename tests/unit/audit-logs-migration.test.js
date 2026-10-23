import { jest, describe, test, expect, beforeEach } from "@jest/globals";

import { up, down } from "../../database/migrations/20261015025110-create-audit-logs-table.js";

// Verify that the audit migration preserves traceability and account references.
describe("Audit logs migration", () => {
    let queryInterface;
    let Sequelize;

    beforeEach(() => {
        // Mock database operations so tests never modify the real database.
        queryInterface = {
            createTable: jest.fn().mockResolvedValue(undefined),
            addIndex: jest.fn().mockResolvedValue(undefined),
            dropTable: jest.fn().mockResolvedValue(undefined),
        };

        // Provide the Sequelize data types used by the migration.
        Sequelize = {
            INTEGER: Object.assign(() => "INTEGER", {
                UNSIGNED: "INTEGER UNSIGNED",
            }),
            STRING: (length) => `VARCHAR(${length})`,
            DATE: "DATETIME",
            JSON: "JSON",
            ENUM: (...values) => ({ type: "ENUM", values }),
        };
    });

    test("up creates the audit_logs table", async () => {
        await up(queryInterface, Sequelize);

        // Audit records are stored in one dedicated table.
        expect(queryInterface.createTable).toHaveBeenCalledTimes(1);
        expect(queryInterface.createTable.mock.calls[0][0]).toBe("audit_logs");
    });

    test("audit logs allow a missing user while preserving the account relationship", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls[0];

        // Automated actions may not have a user account as their actor.
        expect(columns.actor_user_id.allowNull).toBe(true);
        expect(columns.actor_user_id.references).toEqual({
            model: "users",
            key: "id",
        });
        expect(columns.actor_user_id.onDelete).toBe("SET NULL");
        expect(columns.actor_user_id.onUpdate).toBe("CASCADE");
        expect(columns.actor_snapshot.allowNull).toBe(false);
    });

    test("audit logs define required action and target information", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls[0];

        // Each audit event identifies an action and the type of target affected.
        expect(columns.action.allowNull).toBe(false);
        expect(columns.target_type.allowNull).toBe(false);
        expect(columns.target_id.allowNull).toBe(true);
        expect(columns.target_description.allowNull).toBe(true);
        expect(columns.reason.allowNull).toBe(true);
    });

    test("changes are stored as optional JSON", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls[0];

        // Structured changes are optional for events without detailed modifications.
        expect(columns.changes.type).toBe("JSON");
        expect(columns.changes.allowNull).toBe(true);
    });

    test("result only allows Success and Failure", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls[0];

        // Restrict audit outcomes to the two values defined by the schema.
        expect(columns.result.type).toEqual({
            type: "ENUM",
            values: ["Success", "Failure"],
        });
        expect(columns.result.allowNull).toBe(false);
    });

    test("occurred_at is required", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls[0];

        // Every audit record must identify when the event occurred.
        expect(columns.occurred_at.allowNull).toBe(false);
        expect(columns.occurred_at.type).toBe("DATETIME");
    });

    test("up adds indexes for actor, target and event time", async () => {
        await up(queryInterface, Sequelize);

        // These indexes support common audit history queries.
        expect(queryInterface.addIndex.mock.calls).toEqual([
            ["audit_logs", ["actor_user_id"], { name: "audit_logs_actor_user_id_index" }],
            [
                "audit_logs",
                ["target_type", "target_id"],
                { name: "audit_logs_target_type_target_id_index" },
            ],
            ["audit_logs", ["occurred_at"], { name: "audit_logs_occurred_at_index" }],
        ]);
    });

    test("down drops the audit_logs table", async () => {
        await down(queryInterface);

        // Reverting this migration removes its table.
        expect(queryInterface.dropTable).toHaveBeenCalledWith("audit_logs");
    });
});
