"use strict";

const NOTIFICATION_STATUSES = ["Pending", "Processing", "Sent", "Failed", "Cancelled"];
const UNCERTAIN_NOTIFICATION_STATUSES = [...NOTIFICATION_STATUSES, "OutcomeUnknown"];

export async function up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("notifications", "status", {
        type: Sequelize.ENUM(...UNCERTAIN_NOTIFICATION_STATUSES),
        allowNull: false,
        defaultValue: "Pending",
    });
}

export async function down(queryInterface, Sequelize) {
    const [rows] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) AS count FROM notifications WHERE status = :status",
        { replacements: { status: "OutcomeUnknown" } },
    );

    // Keep uncertain records intact; resolve them before removing this status.
    if (Number(rows[0]?.count) > 0) {
        throw new Error("Resolve OutcomeUnknown notifications before reverting this migration.");
    }

    await queryInterface.changeColumn("notifications", "status", {
        type: Sequelize.ENUM(...NOTIFICATION_STATUSES),
        allowNull: false,
        defaultValue: "Pending",
    });
}
