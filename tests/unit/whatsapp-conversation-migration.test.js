import { jest, describe, test, expect, beforeEach } from "@jest/globals";

import {
    up,
    down,
} from "../../database/migrations/20261015025617-create-whatsapp-conversation-tables.js";

// Verify the WhatsApp migration matches the conversation and message schema.
describe("WhatsApp conversation migration", () => {
    let queryInterface;
    let Sequelize;

    beforeEach(() => {
        // Mock database operations so tests never modify the real database.
        queryInterface = {
            createTable: jest.fn().mockResolvedValue(undefined),
            addConstraint: jest.fn().mockResolvedValue(undefined),
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
            TEXT: "TEXT",
            ENUM: (...values) => ({ type: "ENUM", values }),
        };
    });

    test("up creates conversations before messages", async () => {
        await up(queryInterface, Sequelize);

        // Messages depend on conversations, so create the parent table first.
        expect(queryInterface.createTable.mock.calls.map(([table]) => table)).toEqual([
            "whatsapp_conversations",
            "whatsapp_messages",
        ]);
    });

    test("conversations allow an unverified patient", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "whatsapp_conversations",
        );

        // A conversation can start before identity verification is complete.
        expect(columns.patient_id.allowNull).toBe(true);
        expect(columns.patient_id.references).toEqual({
            model: "patients",
            key: "id",
        });
        expect(columns.patient_id.onDelete).toBe("SET NULL");
    });

    test("conversations define provider scope and valid statuses", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "whatsapp_conversations",
        );

        // Provider and account identify the scope of external conversation IDs.
        expect(columns.provider_name.allowNull).toBe(false);
        expect(columns.provider_account_id.allowNull).toBe(false);
        expect(columns.provider_conversation_id.allowNull).toBe(true);

        expect(columns.status.type).toEqual({
            type: "ENUM",
            values: ["Active", "Completed", "Expired", "Blocked"],
        });
        expect(columns.status.defaultValue).toBe("Active");
    });

    test("conversations enforce provider-scoped identifier uniqueness", async () => {
        await up(queryInterface, Sequelize);

        // A provider conversation ID is unique within its provider and account.
        expect(queryInterface.addConstraint).toHaveBeenCalledWith(
            "whatsapp_conversations",
            expect.objectContaining({
                fields: ["provider_name", "provider_account_id", "provider_conversation_id"],
                type: "unique",
                name: "whatsapp_conversations_provider_scope_unique",
            }),
        );
    });

    test("messages reference an existing conversation", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "whatsapp_messages",
        );

        // Every message must belong to a conversation.
        expect(columns.conversation_id.allowNull).toBe(false);
        expect(columns.conversation_id.references).toEqual({
            model: "whatsapp_conversations",
            key: "id",
        });
        expect(columns.conversation_id.onDelete).toBe("RESTRICT");
    });

    test("messages define the expected direction and processing statuses", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "whatsapp_messages",
        );

        // These states distinguish message direction and processing progress.
        expect(columns.direction.type).toEqual({
            type: "ENUM",
            values: ["Inbound", "Outbound"],
        });
        expect(columns.processing_status.type).toEqual({
            type: "ENUM",
            values: ["Received", "Processing", "Processed", "Failed"],
        });
        expect(columns.processing_status.allowNull).toBe(false);
    });

    test("messages define temporary content and lifecycle timestamps", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "whatsapp_messages",
        );

        // Content and lifecycle timestamps are optional under the schema.
        expect(columns.content.type).toBe("TEXT");
        expect(columns.content.allowNull).toBe(true);
        expect(columns.delivery_status.allowNull).toBe(true);
        expect(columns.received_at.allowNull).toBe(true);
        expect(columns.processed_at.allowNull).toBe(true);
        expect(columns.content_expires_at.allowNull).toBe(true);
    });

    test("messages require provider and account identifiers", async () => {
        await up(queryInterface, Sequelize);

        const [, columns] = queryInterface.createTable.mock.calls.find(
            ([table]) => table === "whatsapp_messages",
        );

        // Provider scope is required even when a provider message ID is absent.
        expect(columns.provider_name.allowNull).toBe(false);
        expect(columns.provider_account_id.allowNull).toBe(false);
        expect(columns.provider_message_id.allowNull).toBe(true);
    });

    test("messages enforce provider-scoped identifier uniqueness", async () => {
        await up(queryInterface, Sequelize);

        // Duplicate provider messages must be rejected within the same account.
        expect(queryInterface.addConstraint).toHaveBeenCalledWith(
            "whatsapp_messages",
            expect.objectContaining({
                fields: ["provider_name", "provider_account_id", "provider_message_id"],
                type: "unique",
                name: "whatsapp_messages_provider_scope_unique",
            }),
        );
    });

    test("up creates indexes for patient, activity and conversation history", async () => {
        await up(queryInterface, Sequelize);

        // Indexes support common conversation and message lookup patterns.
        expect(queryInterface.addIndex.mock.calls).toEqual([
            [
                "whatsapp_conversations",
                ["patient_id"],
                { name: "whatsapp_conversations_patient_id_index" },
            ],
            [
                "whatsapp_conversations",
                ["status", "last_activity_at"],
                { name: "whatsapp_conversations_status_activity_index" },
            ],
            [
                "whatsapp_messages",
                ["conversation_id"],
                { name: "whatsapp_messages_conversation_id_index" },
            ],
        ]);
    });

    test("down drops messages before conversations", async () => {
        await down(queryInterface);

        // Drop the child table before the parent table to respect foreign keys.
        expect(queryInterface.dropTable.mock.calls).toEqual([
            ["whatsapp_messages"],
            ["whatsapp_conversations"],
        ]);
    });
});
