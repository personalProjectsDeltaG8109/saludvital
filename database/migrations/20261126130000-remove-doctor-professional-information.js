"use strict";

export async function up(queryInterface) {
    await queryInterface.removeColumn("doctors", "professional_information");
}

export async function down(queryInterface, Sequelize) {
    // The former free-text values cannot be restored after the column is removed.
    await queryInterface.addColumn("doctors", "professional_information", {
        type: Sequelize.TEXT,
        allowNull: true,
    });
}
