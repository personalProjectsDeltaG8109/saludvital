
import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define the role model using the existing MySQL table.
const Rol = database.define(
    "Rol",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING(30),
            allowNull: false,
            unique: true,
        },
        description: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
    },
    {
        // Match the existing database table and timestamp columns.
        tableName: "roles",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

// Export the model for use by services and associations.
export default Rol;
