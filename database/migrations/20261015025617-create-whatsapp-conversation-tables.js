"use strict";

/**
 * Creates WhatsApp conversations and messages with provider-scoped identifiers.
 * Message content is temporary and subject to the retention policy.
 */

export async function up(queryInterface, Sequelize) {
    // Conversations can start before the patient's identity is verified.
    await queryInterface.createTable("whatsapp_conversations", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
        },
        patient_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: true,
            references: {
                model: "patients",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
        },
        provider_name: {
            type: Sequelize.STRING(50),
            allowNull: false,
        },
        provider_account_id: {
            type: Sequelize.STRING(100),
            allowNull: false,
        },
        provider_conversation_id: {
            type: Sequelize.STRING(191),
            allowNull: true,
        },
        status: {
            type: Sequelize.ENUM("Active", "Completed", "Expired", "Blocked"),
            allowNull: false,
            defaultValue: "Active",
        },
        started_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
        last_activity_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
        ended_at: {
            type: Sequelize.DATE,
            allowNull: true,
        },
        created_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
        updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
    });

    // Scope provider conversation identifiers to their provider and account.
    await queryInterface.addConstraint("whatsapp_conversations", {
        fields: ["provider_name", "provider_account_id", "provider_conversation_id"],
        type: "unique",
        name: "whatsapp_conversations_provider_scope_unique",
    });

    // Store inbound and outbound messages with their processing lifecycle.
    await queryInterface.createTable("whatsapp_messages", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
        },
        conversation_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            references: {
                model: "whatsapp_conversations",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        },
        provider_message_id: {
            type: Sequelize.STRING(191),
            allowNull: true,
        },
        direction: {
            type: Sequelize.ENUM("Inbound", "Outbound"),
            allowNull: false,
        },
        message_type: {
            type: Sequelize.STRING(40),
            allowNull: false,
        },
        content: {
            // Temporary content must follow the approved retention policy.
            type: Sequelize.TEXT,
            allowNull: true,
        },
        processing_status: {
            type: Sequelize.ENUM("Received", "Processing", "Processed", "Failed"),
            allowNull: false,
        },
        delivery_status: {
            type: Sequelize.STRING(30),
            allowNull: true,
        },
        received_at: {
            type: Sequelize.DATE,
            allowNull: true,
        },
        processed_at: {
            type: Sequelize.DATE,
            allowNull: true,
        },
        content_expires_at: {
            type: Sequelize.DATE,
            allowNull: true,
        },
        created_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
        provider_name: {
            type: Sequelize.STRING(50),
            allowNull: false,
        },
        provider_account_id: {
            type: Sequelize.STRING(100),
            allowNull: false,
        },
    });

    // Prevent duplicate provider messages within the same account scope.
    await queryInterface.addConstraint("whatsapp_messages", {
        fields: ["provider_name", "provider_account_id", "provider_message_id"],
        type: "unique",
        name: "whatsapp_messages_provider_scope_unique",
    });

    // Support patient history and active conversation lookups.
    await queryInterface.addIndex("whatsapp_conversations", ["patient_id"], {
        name: "whatsapp_conversations_patient_id_index",
    });

    await queryInterface.addIndex("whatsapp_conversations", ["status", "last_activity_at"], {
        name: "whatsapp_conversations_status_activity_index",
    });

    // Support message history lookups by conversation.
    await queryInterface.addIndex("whatsapp_messages", ["conversation_id"], {
        name: "whatsapp_messages_conversation_id_index",
    });
}

export async function down(queryInterface) {
    // Remove dependent messages before their parent conversations.
    await queryInterface.dropTable("whatsapp_messages");
    await queryInterface.dropTable("whatsapp_conversations");
}
