
import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define audit log records using the existing MySQL table.
const AuditLog = database.define(
    "AuditLog",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        actor_user_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        actor_snapshot: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        action: {
            type: DataTypes.STRING(60),
            allowNull: false,
        },
        target_type: {
            type: DataTypes.STRING(60),
            allowNull: false,
        },
        target_id: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        target_description: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        changes: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        reason: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        result: {
            type: DataTypes.ENUM("Success", "Failure"),
            allowNull: false,
        },
        occurred_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    },
    {
        // Match the existing table; it has no created_at or updated_at columns.
        tableName: "audit_logs",
        freezeTableName: true,
        timestamps: false,
    },
);

export default AuditLog;
