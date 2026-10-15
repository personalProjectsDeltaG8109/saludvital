
"use strict";

// Create patient and doctor profiles using the existing foundation tables.
export async function up(queryInterface, Sequelize) {
    // Store personal, identification, and basic medical information.
    await queryInterface.createTable("patients", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        user_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: true,
            unique: true,
            references: {
                model: "users",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
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
        date_of_birth: {
            type: Sequelize.DATEONLY,
            allowNull: false,
        },
        document_type: {
            type: Sequelize.ENUM("CC", "CE"),
            allowNull: false,
        },
        document_number: {
            type: Sequelize.STRING(15),
            allowNull: false,
        },
        department: {
            type: Sequelize.STRING(100),
            allowNull: false,
        },
        municipality: {
            type: Sequelize.STRING(100),
            allowNull: false,
        },
        blood_type: {
            type: Sequelize.STRING(3),
            allowNull: true,
        },
        allergies: {
            type: Sequelize.TEXT,
            allowNull: true,
        },
        existing_conditions: {
            type: Sequelize.TEXT,
            allowNull: true,
        },
        address: {
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

    // Prevent duplicate patient documents while allowing different document types.
    await queryInterface.addConstraint("patients", {
        fields: ["document_type", "document_number"],
        type: "unique",
        name: "patients_document_type_number_unique",
    });

    // Link each doctor profile to one user account and one specialty.
    await queryInterface.createTable("doctors", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        user_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            unique: true,
            references: {
                model: "users",
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
        professional_information: {
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

// Remove dependent tables before their referenced foundation tables.
export async function down(queryInterface) {
    await queryInterface.dropTable("doctors");
    await queryInterface.dropTable("patients");
}
