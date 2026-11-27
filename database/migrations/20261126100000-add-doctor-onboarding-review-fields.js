"use strict";

export async function up(queryInterface, Sequelize) {
    await queryInterface.addColumn("doctors", "first_name", {
        type: Sequelize.STRING(80),
        allowNull: true,
    });
    await queryInterface.addColumn("doctors", "last_name", {
        type: Sequelize.STRING(80),
        allowNull: true,
    });
    await queryInterface.addColumn("doctors", "document_type", {
        type: Sequelize.STRING(2),
        allowNull: true,
    });
    await queryInterface.addColumn("doctors", "document_number", {
        type: Sequelize.STRING(15),
        allowNull: true,
    });
    await queryInterface.addColumn("doctors", "professional_registration_number", {
        type: Sequelize.STRING(40),
        allowNull: true,
    });
    await queryInterface.addColumn("doctors", "profile_review_status", {
        type: Sequelize.STRING(24),
        allowNull: false,
        defaultValue: "approved",
    });
    await queryInterface.addColumn("doctors", "profile_review_note", {
        type: Sequelize.STRING(500),
        allowNull: true,
    });

    await queryInterface.addIndex("doctors", ["document_type", "document_number"], {
        name: "doctors_identity_document_unique",
        unique: true,
    });
}

export async function down(queryInterface) {
    await queryInterface.removeIndex("doctors", "doctors_identity_document_unique");
    await queryInterface.removeColumn("doctors", "profile_review_note");
    await queryInterface.removeColumn("doctors", "profile_review_status");
    await queryInterface.removeColumn("doctors", "professional_registration_number");
    await queryInterface.removeColumn("doctors", "document_number");
    await queryInterface.removeColumn("doctors", "document_type");
    await queryInterface.removeColumn("doctors", "last_name");
    await queryInterface.removeColumn("doctors", "first_name");
}
