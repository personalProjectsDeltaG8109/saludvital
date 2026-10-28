import database from "../../config/database.js";
import { DataTypes } from "sequelize";

const ChatbotFlowVersion = database.define(
    "ChatbotFlowVersion",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        flow_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        version_number: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        description: {
            type: DataTypes.STRING(500),
            allowNull: false,
            defaultValue: "",
        },
        status: {
            type: DataTypes.ENUM("Draft"),
            allowNull: false,
            defaultValue: "Draft",
        },
        definition: {
            type: DataTypes.JSON,
            allowNull: false,
        },
        created_by: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
    },
    {
        tableName: "chatbot_flow_versions",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: false,
        indexes: [{ unique: true, fields: ["flow_id", "version_number"] }],
    },
);

export default ChatbotFlowVersion;
