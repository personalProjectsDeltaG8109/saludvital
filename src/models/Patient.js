import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define the patient profile using the existing MySQL patients table.
const Patient = database.define(
    "Patient",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        user_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
            unique: true,
        },
        first_name: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        last_name: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        phone: {
            type: DataTypes.STRING(15),
            allowNull: false,
        },
        // Keep notification destinations separate from account contact details.
        notification_phone: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        notification_email: {
            type: DataTypes.STRING(254),
            allowNull: true,
            validate: {
                isEmail: true,
            },
        },
        date_of_birth: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        document_type: {
            type: DataTypes.ENUM("CC", "CE"),
            allowNull: false,
        },
        document_number: {
            type: DataTypes.STRING(15),
            allowNull: false,
        },
        department: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        municipality: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        blood_type: {
            type: DataTypes.STRING(3),
            allowNull: true,
        },
        allergies: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        existing_conditions: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        address: {
            type: DataTypes.STRING(150),
            allowNull: true,
        },
        profile_photo_url: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
    },
    {
        tableName: "patients",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default Patient;
