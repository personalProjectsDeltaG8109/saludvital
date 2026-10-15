
import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define patient notification preferences using the existing MySQL table.
const NotificationPreference = database.define(
    "NotificationPreference",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        patient_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        channel: {
            type: DataTypes.ENUM("Email", "SMS", "WhatsApp"),
            allowNull: false,
        },
        event_type: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        is_enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
    },
    {
        // Match the existing table and timestamp column names.
        tableName: "notification_preferences",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default NotificationPreference;
