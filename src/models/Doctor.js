import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define the doctor profile using the existing MySQL doctors table.
const Doctor = database.define(
    "Doctor",
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
            unique: true,
        },
        specialty_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        // Keep the doctor's patient-facing name on the doctor profile.
        display_name: {
            type: DataTypes.STRING(120),
            allowNull: true,
        },
        first_name: {
            type: DataTypes.STRING(80),
            allowNull: true,
        },
        last_name: {
            type: DataTypes.STRING(80),
            allowNull: true,
        },
        document_type: {
            type: DataTypes.STRING(2),
            allowNull: true,
        },
        document_number: {
            type: DataTypes.STRING(15),
            allowNull: true,
        },
        professional_registration_number: {
            type: DataTypes.STRING(40),
            allowNull: true,
        },
        profile_review_status: {
            type: DataTypes.STRING(24),
            allowNull: false,
            defaultValue: "approved",
        },
        profile_review_note: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        // Store an optional protected path for the doctor's profile photo.
        profile_photo_url: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        alternate_phone: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        address: {
            type: DataTypes.STRING(150),
            allowNull: true,
        },
        department: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        municipality: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
    },
    {
        tableName: "doctors",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default Doctor;
