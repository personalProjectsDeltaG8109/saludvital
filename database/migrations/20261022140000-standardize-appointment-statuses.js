"use strict";

// Rename appointment statuses while preserving existing appointment references.
async function renameStatus(queryInterface, sourceName, targetName, description) {
    const { QueryTypes } = queryInterface.sequelize.Sequelize;

    const statuses = await queryInterface.sequelize.query(
        `SELECT id, name
         FROM appointment_statuses
         WHERE name IN (:names)`,
        {
            replacements: { names: [sourceName, targetName] },
            type: QueryTypes.SELECT,
        },
    );

    const sourceStatus = statuses.find((status) => status.name === sourceName);
    const targetStatus = statuses.find((status) => status.name === targetName);

    // Nothing needs to change when the source status is absent.
    if (!sourceStatus) {
        return;
    }

    // Merge existing appointments if the target status already exists.
    if (targetStatus) {
        await queryInterface.sequelize.query(
            `UPDATE appointments
             SET status_id = :targetId
             WHERE status_id = :sourceId`,
            {
                replacements: {
                    sourceId: sourceStatus.id,
                    targetId: targetStatus.id,
                },
            },
        );

        await queryInterface.sequelize.query(
            `DELETE FROM appointment_statuses
             WHERE id = :sourceId`,
            {
                replacements: { sourceId: sourceStatus.id },
            },
        );

        return;
    }

    // Rename the status in place so existing appointment references stay valid.
    await queryInterface.sequelize.query(
        `UPDATE appointment_statuses
         SET name = :targetName,
             description = :description,
             updated_at = :updatedAt
         WHERE id = :statusId`,
        {
            replacements: {
                targetName,
                description,
                updatedAt: new Date(),
                statusId: sourceStatus.id,
            },
        },
    );
}

// Apply the new appointment status names.
export async function up(queryInterface) {
    await renameStatus(
        queryInterface,
        "Pending",
        "Confirmed",
        "The appointment has been confirmed.",
    );

    await renameStatus(
        queryInterface,
        "Completed",
        "Attended",
        "The appointment has been attended.",
    );
}

// Restore the previous names if the migration is rolled back.
export async function down(queryInterface) {
    await renameStatus(
        queryInterface,
        "Confirmed",
        "Pending",
        "The appointment is awaiting attention.",
    );

    await renameStatus(
        queryInterface,
        "Attended",
        "Completed",
        "The appointment has been completed.",
    );
}