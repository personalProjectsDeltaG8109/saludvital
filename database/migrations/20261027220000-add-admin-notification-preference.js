"use strict";

export async function up(queryInterface, Sequelize) {
    await queryInterface.addColumn("users", "admin_notifications_enabled", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    });
}

export async function down(queryInterface) {
    await queryInterface.removeColumn("users", "admin_notifications_enabled");
}
