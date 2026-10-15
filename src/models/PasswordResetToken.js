
import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define password reset tokens using the existing MySQL table.
const PasswordResetToken = database.define(
    "PasswordResetToken",
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
        },
        token_hash: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        expires_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        used_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        // Use the existing table without automatic timestamp management.
        tableName: "password_reset_tokens",
        freezeTableName: true,
        timestamps: false,
    },
);

export default PasswordResetToken;
