import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define notification delivery records using the existing MySQL table.
const Notification = database.define(
    "Notification",
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
        appointment_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        channel: {
            type: DataTypes.ENUM("Email", "SMS", "WhatsApp"),
            allowNull: false,
        },
        recipient_address: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        event_type: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        payload: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        status: {
            type: DataTypes.ENUM("Pending", "Processing", "Sent", "Failed", "Cancelled"),
            allowNull: false,
            defaultValue: "Pending",
        },
        scheduled_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        sent_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        attempt_count: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        provider_message_id: {
            type: DataTypes.STRING(191),
            allowNull: true,
        },
        last_error: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    },
    {
        // Match the existing table and timestamp column names.
        tableName: "notifications",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default Notification;
