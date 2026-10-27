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
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
            validate: {
                isEmail: true,
            },
        },
        display_name: {
            type: DataTypes.STRING(120),
            allowNull: true,
        },
        phone: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        profile_photo_url: {
            type: DataTypes.STRING(255),
            allowNull: true,
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

        // Record when the account email was successfully verified.
        email_verified_at: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null,
        },

        // Store only the hash of the email verification token.
        email_verification_token_hash: {
            type: DataTypes.STRING(64),
            allowNull: true,
            defaultValue: null,
        },

        // Expire verification tokens after the configured validity period.
        email_verification_expires_at: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null,
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
