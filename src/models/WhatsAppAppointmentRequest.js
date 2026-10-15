
import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define WhatsApp appointment requests using the existing MySQL table.
const WhatsAppAppointmentRequest = database.define(
    "WhatsAppAppointmentRequest",
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
        conversation_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        requested_specialty_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        requested_doctor_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        requested_start_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        appointment_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        status: {
            type: DataTypes.ENUM(
                "Pending",
                "Confirmed",
                "Rejected",
                "Cancelled",
                "Expired",
            ),
            allowNull: false,
            defaultValue: "Pending",
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        idempotency_key: {
            type: DataTypes.STRING(191),
            allowNull: false,
            unique: true,
        },
    },
    {
        // Use the existing table without changing the database schema.
        tableName: "whatsapp_appointment_requests",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default WhatsAppAppointmentRequest;
