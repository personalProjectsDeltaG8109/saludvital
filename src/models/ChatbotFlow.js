import database from "../../config/database.js";
import { DataTypes } from "sequelize";

const ChatbotFlow = database.define(
    "ChatbotFlow",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
    },
    {
        tableName: "chatbot_flows",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default ChatbotFlow;
