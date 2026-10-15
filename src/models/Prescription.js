
import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define medical prescriptions using the existing MySQL table.
const Prescription = database.define(
    "Prescription",
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
        issued_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    },
    {
        // Map the model to the existing MySQL table.
        tableName: "prescriptions",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default Prescription;
