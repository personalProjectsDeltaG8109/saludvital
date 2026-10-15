
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
        professional_information: {
            type: DataTypes.TEXT,
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
