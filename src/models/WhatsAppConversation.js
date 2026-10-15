import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define WhatsApp conversations using the existing MySQL table.
const WhatsAppConversation = database.define(
    "WhatsAppConversation",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        patient_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        provider_name: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        provider_account_id: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        provider_conversation_id: {
            type: DataTypes.STRING(191),
            allowNull: true,
        },
        status: {
            type: DataTypes.ENUM(
                "Active",
                "Completed",
                "Expired",
                "Blocked",
            ),
            allowNull: false,
            defaultValue: "Active",
        },
        started_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        last_activity_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        ended_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        // Match the existing table and timestamp column names.
        tableName: "whatsapp_conversations",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default WhatsAppConversation;