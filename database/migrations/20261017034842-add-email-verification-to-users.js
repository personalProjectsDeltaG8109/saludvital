"use strict";

// Add secure email verification fields to existing user accounts.
export async function up(queryInterface, Sequelize) {
    await queryInterface.addColumn("users", "email_verified_at", {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
    });

    await queryInterface.addColumn("users", "email_verification_token_hash", {
        type: Sequelize.STRING(64),
        allowNull: true,
        defaultValue: null,
    });

    await queryInterface.addColumn("users", "email_verification_expires_at", {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
    });

    // Prevent two accounts from sharing the same verification token hash.
    await queryInterface.addConstraint("users", {
        fields: ["email_verification_token_hash"],
        type: "unique",
        name: "users_email_verification_token_hash_unique",
    });
}

// Remove the verification fields when rolling back this migration.
export async function down(queryInterface) {
    await queryInterface.removeConstraint("users", "users_email_verification_token_hash_unique");

    await queryInterface.removeColumn("users", "email_verification_expires_at");
    await queryInterface.removeColumn("users", "email_verification_token_hash");
    await queryInterface.removeColumn("users", "email_verified_at");
}
