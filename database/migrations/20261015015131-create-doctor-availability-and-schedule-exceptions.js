"use strict";

// Create the regular availability and exceptional schedule tables.
export async function up(queryInterface, Sequelize) {
    // Define the weekly availability blocks for each doctor.
    await queryInterface.createTable("doctor_availability", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        doctor_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            references: { model: "doctors", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        },
        day_of_week: {
            type: Sequelize.TINYINT.UNSIGNED,
            allowNull: false,
        },
        start_time: {
            type: Sequelize.TIME,
            allowNull: false,
        },
        end_time: {
            type: Sequelize.TIME,
            allowNull: false,
        },
        valid_from: {
            type: Sequelize.DATEONLY,
            allowNull: false,
        },
        valid_until: {
            type: Sequelize.DATEONLY,
            allowNull: true,
        },
        is_active: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        created_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
        updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
    });

    // Restrict weekly availability to valid Colombian business hours.
    await queryInterface.addConstraint("doctor_availability", {
        fields: ["day_of_week"],
        type: "check",
        where: Sequelize.literal("day_of_week BETWEEN 1 AND 7"),
        name: "doctor_availability_day_of_week_check",
    });

    await queryInterface.addConstraint("doctor_availability", {
        fields: ["start_time", "end_time"],
        type: "check",
        where: Sequelize.literal(
            "start_time >= '07:00:00' AND end_time <= '19:00:00' AND end_time > start_time",
        ),
        name: "doctor_availability_business_hours_check",
    });

    await queryInterface.addConstraint("doctor_availability", {
        fields: ["valid_from", "valid_until"],
        type: "check",
        where: Sequelize.literal("valid_until IS NULL OR valid_until >= valid_from"),
        name: "doctor_availability_valid_dates_check",
    });

    // Record exceptions and the actor responsible for each schedule change.
    await queryInterface.createTable("doctor_schedule_exceptions", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        doctor_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            references: { model: "doctors", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        },
        start_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
        end_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
        exception_type: {
            type: Sequelize.ENUM("Unavailable", "AdditionalAvailability"),
            allowNull: false,
        },
        reason: {
            type: Sequelize.STRING(255),
            allowNull: false,
        },
        created_by: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: true,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        },
        actor_snapshot: {
            type: Sequelize.STRING(100),
            allowNull: false,
        },
        created_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
    });

    // Prevent exceptions with an invalid time interval.
    await queryInterface.addConstraint("doctor_schedule_exceptions", {
        fields: ["start_at", "end_at"],
        type: "check",
        where: Sequelize.literal("end_at > start_at"),
        name: "doctor_schedule_exceptions_time_range_check",
    });
}

// Remove dependent schedule records before reverting the migration.
export async function down(queryInterface) {
    await queryInterface.dropTable("doctor_schedule_exceptions");
    await queryInterface.dropTable("doctor_availability");
}
