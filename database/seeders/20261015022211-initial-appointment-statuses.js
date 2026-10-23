"use strict";

// Seed the appointment status catalog without creating duplicate records.
export async function up(queryInterface) {
    const statuses = [
        {
            name: "Confirmed",
            description: "The appointment has been confirmed.",
        },
        {
            name: "In Progress",
            description: "The appointment is currently being attended.",
        },
        {
            name: "Attended",
            description: "The appointment has been attended.",
        },
        {
            name: "Cancelled",
            description: "The appointment has been cancelled.",
        },
    ];

    // Check existing names so rerunning the seeder does not duplicate statuses.
    const [existingStatuses] = await queryInterface.sequelize.query(
        "SELECT name FROM appointment_statuses",
    );

    const existingNames = new Set(existingStatuses.map((status) => status.name));

    // Insert only the statuses that do not exist yet.
    const missingStatuses = statuses
        .filter((status) => !existingNames.has(status.name))
        .map((status) => ({
            ...status,
            created_at: new Date(),
            updated_at: new Date(),
        }));

    if (missingStatuses.length > 0) {
        await queryInterface.bulkInsert("appointment_statuses", missingStatuses);
    }
}

// Keep seeded status records to protect appointment references and history.
export async function down() {
    // Intentionally do not delete status records during rollback.
}
