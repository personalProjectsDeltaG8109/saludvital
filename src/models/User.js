
import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define the user model using the existing MySQL table.
const User = database.define(
    "User",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        role_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        email: {
            type: DataTypes.STRING(80),
            allowNull: false,
            unique: true,
            validate: {
                isEmail: true,
            },
        },
        password_hash: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        last_login_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        // Preserve the existing table name and timestamp columns.
        tableName: "users",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

// Export the model for use by services and associations.
export default User;
