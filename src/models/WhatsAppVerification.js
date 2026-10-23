import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define WhatsApp identity verifications using the existing MySQL table.
const WhatsAppVerification = database.define(
    "WhatsAppVerification",
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
        code_hash: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        expires_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        attempt_count: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        verified_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        invalidated_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    },
    {
        // Map the model to the existing table without creating or altering it.
        tableName: "whatsapp_verifications",
        freezeTableName: true,
        timestamps: false,
    },
);

export default WhatsAppVerification;
