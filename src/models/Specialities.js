
import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define the medical specialty model using the existing MySQL table.
const Specialities = database.define(
    "Specialities",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
        },
        description: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
    },
    {
        // Match the existing database table and timestamp columns.
        tableName: "specialties",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

// Export the model for use by doctors and other modules.
export default Specialities;
