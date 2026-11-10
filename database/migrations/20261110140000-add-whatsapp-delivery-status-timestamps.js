export async function up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
        await queryInterface.addColumn(
            "whatsapp_messages",
            "delivery_status_at",
            { type: Sequelize.DATE, allowNull: true },
            { transaction },
        );
        await queryInterface.addColumn(
            "notifications",
            "provider_delivery_status_at",
            { type: Sequelize.DATE, allowNull: true },
            { transaction },
        );
        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}

export async function down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
        await queryInterface.removeColumn("notifications", "provider_delivery_status_at", {
            transaction,
        });
        await queryInterface.removeColumn("whatsapp_messages", "delivery_status_at", {
            transaction,
        });
        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}
