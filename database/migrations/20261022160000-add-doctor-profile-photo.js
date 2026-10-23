"use strict";

// Add an optional profile photo path to each doctor record.
export async function up(queryInterface, Sequelize) {
    await queryInterface.addColumn("doctors", "profile_photo_url", {
        type: Sequelize.STRING(255),
        allowNull: true,
    });
}

// Remove the optional doctor photo path when rolling back this migration.
export async function down(queryInterface) {
    await queryInterface.removeColumn("doctors", "profile_photo_url");
}
