import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define doctor schedule exceptions using the existing MySQL table.
const DoctorScheduleException = database.define(
    "DoctorScheduleException",
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
        start_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        end_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        exception_type: {
            type: DataTypes.ENUM("Unavailable", "AdditionalAvailability"),
            allowNull: false,
        },
        reason: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        created_by: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        actor_snapshot: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
    },
    {
        tableName: "doctor_schedule_exceptions",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default DoctorScheduleException;
