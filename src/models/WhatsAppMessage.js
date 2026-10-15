import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define WhatsApp messages using the existing MySQL table.
const WhatsAppMessage = database.define(
    "WhatsAppMessage",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        conversation_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        provider_message_id: {
            type: DataTypes.STRING(191),
            allowNull: true,
        },
        direction: {
            type: DataTypes.ENUM("Inbound", "Outbound"),
            allowNull: false,
        },
        message_type: {
            type: DataTypes.STRING(40),
            allowNull: false,
        },
        content: {
            // Message content must follow the approved retention policy.
            type: DataTypes.TEXT,
            allowNull: true,
        },
        processing_status: {
            type: DataTypes.ENUM(
                "Received",
                "Processing",
                "Processed",
                "Failed",
            ),
            allowNull: false,
        },
        delivery_status: {
            type: DataTypes.STRING(30),
            allowNull: true,
        },
        received_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        processed_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        content_expires_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        provider_name: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        provider_account_id: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
    },
    {
        // The migration defines created_at but not updated_at.
        tableName: "whatsapp_messages",
        freezeTableName: true,
        timestamps: false,
    },
);

export default WhatsAppMessage;