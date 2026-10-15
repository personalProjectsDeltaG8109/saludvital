
import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define the appointment history model using the existing MySQL table.
const AppointmentHistory = database.define(
    "AppointmentHistory",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        appointment_id: {
            type: DataTypes.INTEGER.UNSIGNED,
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
        event_type: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        previous_values: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        new_values: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        reason: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        occurred_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    },
    {
        // This table has no updated_at column, so disable automatic timestamps.
        tableName: "appointment_history",
        freezeTableName: true,
        timestamps: false,
    },
);

export default AppointmentHistory;
