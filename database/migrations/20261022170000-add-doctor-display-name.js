"use strict";

// Add an optional patient-facing name to each doctor profile.
export async function up(queryInterface, Sequelize) {
    await queryInterface.addColumn("doctors", "display_name", {
        type: Sequelize.STRING(120),
        allowNull: true,
        after: "specialty_id",
    });
}

// Remove the patient-facing doctor name when rolling back this migration.
export async function down(queryInterface) {
    await queryInterface.removeColumn("doctors", "display_name");
}
