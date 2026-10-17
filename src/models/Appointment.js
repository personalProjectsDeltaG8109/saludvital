import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define the appointment model using the existing MySQL table.
const Appointment = database.define(
    "Appointment",
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
        doctor_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        specialty_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        status_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        start_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        end_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        reason: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        source: {
            type: DataTypes.ENUM("Web", "WhatsApp", "Admin"),
            allowNull: false,
        },
    },
    {
        // Match the existing table and timestamp column names.
        tableName: "appointments",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default Appointment;
