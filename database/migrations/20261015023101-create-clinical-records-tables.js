"use strict";

// Create the clinical tables while preserving medical and prescription records.
export async function up(queryInterface, Sequelize) {
    // Store one consultation at most for each appointment.
    await queryInterface.createTable("consultations", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        appointment_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            unique: true,
            references: {
                model: "appointments",
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
        started_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
        ended_at: {
            type: Sequelize.DATE,
            allowNull: true,
        },
        duration_seconds: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: true,
        },
        symptoms: {
            type: Sequelize.TEXT,
            allowNull: true,
        },
        patient_feeling: {
            type: Sequelize.TEXT,
            allowNull: true,
        },
        vital_signs: {
            type: Sequelize.JSON,
            allowNull: true,
        },
        clinical_notes: {
            type: Sequelize.TEXT,
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
        status: {
            type: Sequelize.ENUM("InProgress", "Completed", "Interrupted"),
            allowNull: false,
            defaultValue: "InProgress",
        },
        interruption_reason: {
            type: Sequelize.STRING(500),
            allowNull: true,
        },
    });

    // Prevent a completed consultation from ending before it started.
    await queryInterface.addConstraint("consultations", {
        fields: ["ended_at", "started_at"],
        type: "check",
        name: "consultations_time_range_check",
        where: Sequelize.literal("`ended_at` IS NULL OR `ended_at` > `started_at`"),
    });

    // Store the diagnoses recorded during each consultation.
    await queryInterface.createTable("diagnoses", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        consultation_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            references: {
                model: "consultations",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        },
        diagnosis: {
            type: Sequelize.TEXT,
            allowNull: false,
        },
        notes: {
            type: Sequelize.TEXT,
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

    // Store prescriptions linked to the consultation that produced them.
    await queryInterface.createTable("prescriptions", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        consultation_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            references: {
                model: "consultations",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        },
        issued_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
        notes: {
            type: Sequelize.TEXT,
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

    // Store each medication and its instructions as a separate prescription item.
    await queryInterface.createTable("prescription_items", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        prescription_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            references: {
                model: "prescriptions",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        },
        medication_name: {
            type: Sequelize.STRING(150),
            allowNull: false,
        },
        dosage: {
            type: Sequelize.STRING(100),
            allowNull: false,
        },
        frequency: {
            type: Sequelize.STRING(100),
            allowNull: false,
        },
        duration: {
            type: Sequelize.STRING(100),
            allowNull: false,
        },
        instructions: {
            type: Sequelize.TEXT,
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
}

// Remove dependent tables first when reverting this migration.
export async function down(queryInterface) {
    await queryInterface.dropTable("prescription_items");
    await queryInterface.dropTable("prescriptions");
    await queryInterface.dropTable("diagnoses");

    // Remove the consultation check before dropping its table.
    await queryInterface.removeConstraint("consultations", "consultations_time_range_check");

    await queryInterface.dropTable("consultations");
}
