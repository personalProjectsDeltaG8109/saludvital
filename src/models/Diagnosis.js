
import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define medical diagnoses using the existing MySQL table.
const Diagnosis = database.define(
    "Diagnosis",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        consultation_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        diagnosis: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    },
    {
        // Use the existing table and its timestamp columns.
        tableName: "diagnoses",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default Diagnosis;

