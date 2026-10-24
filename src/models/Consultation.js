import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define medical consultations using the existing MySQL table.
const Consultation = database.define(
    "Consultation",
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
            unique: true,
        },
        doctor_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        started_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        ended_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        duration_seconds: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        symptoms: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        patient_feeling: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        vital_signs: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        clinical_notes: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        recommendations: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        medical_orders: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        status: {
            type: DataTypes.ENUM("InProgress", "Completed", "Interrupted"),
            allowNull: false,
            defaultValue: "InProgress",
        },
        interruption_reason: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
    },
    {
        // Map the model to the existing table without altering the schema.
        tableName: "consultations",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default Consultation;
