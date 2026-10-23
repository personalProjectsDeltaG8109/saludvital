"use strict";

// Store an event snapshot so queued messages retain the details that were scheduled.
export async function up(queryInterface, Sequelize) {
    await queryInterface.addColumn("notifications", "payload", {
        type: Sequelize.JSON,
        allowNull: true,
        after: "event_type",
    });
}

export async function down(queryInterface) {
    await queryInterface.removeColumn("notifications", "payload");
}
