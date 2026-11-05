const NO_SHOW_STATUS = {
    name: "No Show",
    description: "The patient did not attend the appointment.",
};

export async function up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
        const [statuses] = await queryInterface.sequelize.query(
            "SELECT id FROM appointment_statuses WHERE name = :name LIMIT 1",
            { replacements: { name: NO_SHOW_STATUS.name }, transaction },
        );

        if (statuses.length === 0) {
            const now = new Date();
            await queryInterface.bulkInsert(
                "appointment_statuses",
                [{ ...NO_SHOW_STATUS, created_at: now, updated_at: now }],
                { transaction },
            );
        }

        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}

export async function down(queryInterface) {
    const [references] = await queryInterface.sequelize.query(
        `SELECT id FROM appointments
         WHERE status_id = (
             SELECT id FROM appointment_statuses WHERE name = :name LIMIT 1
         )
         LIMIT 1`,
        { replacements: { name: NO_SHOW_STATUS.name } },
    );

    if (references.length > 0) {
        throw new Error("Cannot remove the No Show status while appointments use it.");
    }

    await queryInterface.bulkDelete("appointment_statuses", { name: NO_SHOW_STATUS.name });
}
