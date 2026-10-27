"use strict";

export async function up(queryInterface, Sequelize) {
    await queryInterface.addColumn("doctor_schedule_exceptions", "is_active", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    });
    await queryInterface.addColumn("doctor_schedule_exceptions", "updated_at", {
        type: Sequelize.DATE,
        allowNull: true,
    });
}

export async function down(queryInterface) {
    await queryInterface.removeColumn("doctor_schedule_exceptions", "updated_at");
    await queryInterface.removeColumn("doctor_schedule_exceptions", "is_active");
}
