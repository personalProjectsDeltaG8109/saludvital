"use strict";

export async function up(queryInterface, Sequelize) {
    await queryInterface.addColumn("specialties", "logo_url", {
        type: Sequelize.STRING(255),
        allowNull: true,
    });
}

export async function down(queryInterface) {
    await queryInterface.removeColumn("specialties", "logo_url");
}
