import database from "../../config/database.js";
import { DataTypes } from "sequelize";

const PatientConsent = database.define(
    "PatientConsent",
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
        consent_scope: {
            type: DataTypes.STRING(80),
            allowNull: false,
        },
        notice_version: {
            type: DataTypes.STRING(20),
            allowNull: false,
        },
        accepted_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    },
    {
        tableName: "patient_consents",
        freezeTableName: true,
        timestamps: false,
    },
);

export default PatientConsent;
