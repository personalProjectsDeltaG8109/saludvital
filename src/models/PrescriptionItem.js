
import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define prescription items using the existing MySQL table.
const PrescriptionItem = database.define(
    "PrescriptionItem",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        prescription_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        medication_name: {
            type: DataTypes.STRING(150),
            allowNull: false,
        },
        dosage: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        frequency: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        duration: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        instructions: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    },
    {
        // Map the model to the existing MySQL table.
        tableName: "prescription_items",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default PrescriptionItem;
