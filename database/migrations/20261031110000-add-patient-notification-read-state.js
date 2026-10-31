"use strict";

export async function up(queryInterface, Sequelize) {
    await queryInterface.addColumn("notifications", "read_at", {
        type: Sequelize.DATE,
        allowNull: true,
    });

    // Existing history predates read tracking and must not appear as newly unread.
    await queryInterface.sequelize.query(
        "UPDATE notifications SET read_at = COALESCE(sent_at, scheduled_at, created_at) WHERE read_at IS NULL",
    );
}

export async function down(queryInterface) {
    await queryInterface.removeColumn("notifications", "read_at");
}
