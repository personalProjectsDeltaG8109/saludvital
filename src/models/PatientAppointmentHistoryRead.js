import database from "../../config/database.js";
import { DataTypes } from "sequelize";

const PatientAppointmentHistoryRead = database.define(
    "PatientAppointmentHistoryRead",
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
        appointment_history_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        read_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    },
    {
        tableName: "patient_appointment_history_reads",
        freezeTableName: true,
        timestamps: false,
    },
);

export default PatientAppointmentHistoryRead;
