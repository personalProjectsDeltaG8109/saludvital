import database from "../../config/database.js";
import { DataTypes } from "sequelize";

const WhatsAppChatbotRuntimeSetting = database.define(
    "WhatsAppChatbotRuntimeSetting",
    {
        id: {
            type: DataTypes.TINYINT.UNSIGNED,
            primaryKey: true,
            allowNull: false,
        },
        active_flow_version_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
    },
    {
        tableName: "whatsapp_chatbot_runtime_settings",
        freezeTableName: true,
        timestamps: true,
        createdAt: false,
        updatedAt: "updated_at",
    },
);

export default WhatsAppChatbotRuntimeSetting;
