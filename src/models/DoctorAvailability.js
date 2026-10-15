
import database from "../../config/database.js";
import { DataTypes } from "sequelize";

// Define the regular doctor availability model using the existing MySQL table.
const DoctorAvailability = database.define(
    "DoctorAvailability",
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
        day_of_week: {
            type: DataTypes.TINYINT.UNSIGNED,
            allowNull: false,
            validate: {
                min: 1,
                max: 7,
            },
        },
        start_time: {
            type: DataTypes.TIME,
            allowNull: false,
        },
        end_time: {
            type: DataTypes.TIME,
            allowNull: false,
        },
        valid_from: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        valid_until: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
    },
    {
        // Match the existing table and timestamp column names.
        tableName: "doctor_availability",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default DoctorAvailability;
