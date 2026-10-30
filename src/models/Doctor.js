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
        professional_information: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        // Store an optional public path for the doctor's profile photo.
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
