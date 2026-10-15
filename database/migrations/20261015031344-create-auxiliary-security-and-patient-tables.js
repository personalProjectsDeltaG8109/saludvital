
"use strict";

// Create auxiliary patient, WhatsApp verification, and password recovery tables.
export async function up(queryInterface, Sequelize) {
    // Store protected identity-verification records for existing patients.
    await queryInterface.createTable("whatsapp_verifications", {
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
        code_hash: {
            type: Sequelize.STRING(255),
            allowNull: false,
        },
        expires_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
        attempt_count: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        verified_at: {
            type: Sequelize.DATE,
            allowNull: true,
        },
        invalidated_at: {
            type: Sequelize.DATE,
            allowNull: true,
        },
        created_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
    });

    // Index patient verification history and expiration-based cleanup.
    await queryInterface.addIndex("whatsapp_verifications", ["patient_id"], {
        name: "whatsapp_verifications_patient_id_idx",
    });

    await queryInterface.addIndex(
        "whatsapp_verifications",
        ["expires_at"],
        {
            name: "whatsapp_verifications_expires_at_idx",
        },
    );

    // Store appointment requests submitted through WhatsApp conversations.
    await queryInterface.createTable("whatsapp_appointment_requests", {
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
        conversation_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            references: {
                model: "whatsapp_conversations",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        },
        requested_specialty_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: true,
            references: {
                model: "specialties",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
        },
        requested_doctor_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: true,
            references: {
                model: "doctors",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
        },
        requested_start_at: {
            type: Sequelize.DATE,
            allowNull: true,
        },
        appointment_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: true,
            references: {
                model: "appointments",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
        },
        status: {
            type: Sequelize.ENUM(
                "Pending",
                "Confirmed",
                "Rejected",
                "Cancelled",
                "Expired",
            ),
            allowNull: false,
            defaultValue: "Pending",
        },
        created_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
        updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
        idempotency_key: {
            type: Sequelize.STRING(191),
            allowNull: false,
            unique: true,
        },
    });

    // Support patient history, conversation workflows, and appointment lookups.
    await queryInterface.addIndex(
        "whatsapp_appointment_requests",
        ["patient_id"],
        {
            name: "whatsapp_appointment_requests_patient_id_idx",
        },
    );

    await queryInterface.addIndex(
        "whatsapp_appointment_requests",
        ["conversation_id", "status"],
        {
            name: "whatsapp_appointment_requests_conversation_status_idx",
        },
    );

    await queryInterface.addIndex(
        "whatsapp_appointment_requests",
        ["appointment_id"],
        {
            name: "whatsapp_appointment_requests_appointment_id_idx",
        },
    );

    // Store emergency contacts separately from the patient's clinical records.
    await queryInterface.createTable("emergency_contacts", {
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
            onDelete: "CASCADE",
        },
        first_name: {
            type: Sequelize.STRING(50),
            allowNull: false,
        },
        last_name: {
            type: Sequelize.STRING(50),
            allowNull: false,
        },
        phone: {
            type: Sequelize.STRING(15),
            allowNull: false,
        },
        email: {
            type: Sequelize.STRING(254),
            allowNull: true,
        },
        relationship: {
            type: Sequelize.STRING(50),
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

    // Retrieve all emergency contacts belonging to a patient efficiently.
    await queryInterface.addIndex("emergency_contacts", ["patient_id"], {
        name: "emergency_contacts_patient_id_idx",
    });

    // Store password-reset token hashes, never the original tokens.
    await queryInterface.createTable("password_reset_tokens", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        user_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            references: {
                model: "users",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
        },
        token_hash: {
            type: Sequelize.STRING(255),
            allowNull: false,
        },
        expires_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
        used_at: {
            type: Sequelize.DATE,
            allowNull: true,
        },
        created_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
    });

    // Support token lookups by user and cleanup of expired tokens.
    await queryInterface.addIndex("password_reset_tokens", ["user_id"], {
        name: "password_reset_tokens_user_id_idx",
    });

    await queryInterface.addIndex("password_reset_tokens", ["expires_at"], {
        name: "password_reset_tokens_expires_at_idx",
    });
}

// Drop dependent tables first when rolling back this migration.
export async function down(queryInterface) {
    await queryInterface.dropTable("password_reset_tokens");
    await queryInterface.dropTable("emergency_contacts");
    await queryInterface.dropTable("whatsapp_appointment_requests");
    await queryInterface.dropTable("whatsapp_verifications");
}
