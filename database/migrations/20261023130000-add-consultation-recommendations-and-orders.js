"use strict";

// Keep recommendations and non-prescription medical orders distinct from medication records.
export async function up(queryInterface, Sequelize) {
    await queryInterface.addColumn("consultations", "recommendations", {
        type: Sequelize.TEXT,
        allowNull: true,
    });
    await queryInterface.addColumn("consultations", "medical_orders", {
        type: Sequelize.JSON,
        allowNull: true,
    });
}

// Remove only the columns introduced by this migration.
export async function down(queryInterface) {
    await queryInterface.removeColumn("consultations", "medical_orders");
    await queryInterface.removeColumn("consultations", "recommendations");
}
