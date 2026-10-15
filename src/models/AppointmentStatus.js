
import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define the appointment status model using the existing MySQL table.
const AppointmentStatus = database.define(
    "AppointmentStatus",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING(30),
            allowNull: false,
            unique: true,
        },
        description: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
    },
    {
        // Match the existing table and timestamp column names.
        tableName: "appointment_statuses",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default AppointmentStatus;
