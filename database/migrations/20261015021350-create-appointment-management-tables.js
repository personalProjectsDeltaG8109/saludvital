"use strict";

// Create the tables required to manage appointments and preserve their history.
export async function up(queryInterface, Sequelize) {
    // Store appointment statuses in a separate catalog.
    await queryInterface.createTable("appointment_statuses", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        name: {
            type: Sequelize.STRING(30),
            allowNull: false,
            unique: true,
        },
        description: {
            type: Sequelize.STRING(255),
            allowNull: true,
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

    // Store each appointment with references to its patient, doctor, specialty, and status.
    await queryInterface.createTable("appointments", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        patient_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            references: {
                model: "patients",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        },
        doctor_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            references: {
                model: "doctors",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        },
        specialty_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            references: {
                model: "specialties",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        },
        status_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            references: {
                model: "appointment_statuses",
                key: "id",
            },
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
        reason: {
            type: Sequelize.STRING(500),
            allowNull: true,
        },
        source: {
            type: Sequelize.ENUM("Web", "WhatsApp", "Admin"),
            allowNull: false,
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

    // Preserve appointment events and snapshots even if the actor account is deleted.
    await queryInterface.createTable("appointment_history", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        appointment_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            references: {
                model: "appointments",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        },
        actor_user_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: true,
            references: {
                model: "users",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
        },
        actor_snapshot: {
            type: Sequelize.STRING(100),
            allowNull: false,
        },
        event_type: {
            type: Sequelize.STRING(50),
            allowNull: false,
        },
        previous_values: {
            type: Sequelize.JSON,
            allowNull: true,
        },
        new_values: {
            type: Sequelize.JSON,
            allowNull: true,
        },
        reason: {
            type: Sequelize.STRING(500),
            allowNull: true,
        },
        occurred_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
    });

    // Add database checks to prevent appointments with invalid time ranges.
    await queryInterface.addConstraint("appointments", {
        fields: ["end_at", "start_at"],
        type: "check",
        name: "appointments_time_range_check",
        where: Sequelize.literal("`end_at` > `start_at`"),
    });
}

// Drop dependent tables first so the migration can be reverted safely.
export async function down(queryInterface) {
    await queryInterface.dropTable("appointment_history");
    await queryInterface.dropTable("appointments");
    await queryInterface.dropTable("appointment_statuses");
}
