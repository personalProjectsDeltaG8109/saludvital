import database from "../../config/database.js";
import { DataTypes } from "sequelize";

const DoctorAppointmentNotificationRead = database.define(
    "DoctorAppointmentNotificationRead",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        doctor_id: {
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
        tableName: "doctor_appointment_notification_reads",
        freezeTableName: true,
        timestamps: false,
    },
);

export default DoctorAppointmentNotificationRead;
