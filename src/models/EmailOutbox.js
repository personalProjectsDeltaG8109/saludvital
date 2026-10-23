import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define persistent email delivery jobs stored in the email_outbox table.
const EmailOutbox = database.define(
    "EmailOutbox",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        user_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        event_type: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        status: {
            type: DataTypes.ENUM("pending", "processing", "sent", "failed"),
            allowNull: false,
            defaultValue: "pending",
        },
        attempts: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        next_attempt_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        locked_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        sent_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        tableName: "email_outbox",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default EmailOutbox;
