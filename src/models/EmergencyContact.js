import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define patient emergency contacts using the existing MySQL table.
const EmergencyContact = database.define(
    "EmergencyContact",
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
        email: {
            type: DataTypes.STRING(254),
            allowNull: true,
        },
        relationship: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
    },
    {
        // Map the model to the existing table and timestamp columns.
        tableName: "emergency_contacts",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default EmergencyContact;
