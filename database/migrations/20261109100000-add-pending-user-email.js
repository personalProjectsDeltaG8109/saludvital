"use strict";

// Store replacement email addresses separately until their owners confirm them.
export async function up(queryInterface, Sequelize) {
    await queryInterface.addColumn("users", "pending_email", {
        type: Sequelize.STRING(320),
        allowNull: true,
        defaultValue: null,
    });

    await queryInterface.addColumn("users", "email_verification_requested_at", {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
    });

    await queryInterface.addConstraint("users", {
        fields: ["pending_email"],
        type: "unique",
        name: "users_pending_email_unique",
    });
}

// Remove only the added columns and index when rolling back.
export async function down(queryInterface) {
    await queryInterface.removeConstraint("users", "users_pending_email_unique");
    await queryInterface.removeColumn("users", "email_verification_requested_at");
    await queryInterface.removeColumn("users", "pending_email");
}
