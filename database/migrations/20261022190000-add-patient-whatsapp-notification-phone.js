/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
    // Store WhatsApp's destination separately from the SMS notification number.
    await queryInterface.addColumn("patients", "notification_whatsapp_phone", {
        type: Sequelize.STRING(20),
        allowNull: true,
        after: "notification_phone",
    });

    // Preserve the previous shared number as the initial WhatsApp destination.
    await queryInterface.sequelize.query(
        "UPDATE patients SET notification_whatsapp_phone = COALESCE(notification_phone, phone)",
    );
}

export async function down(queryInterface) {
    await queryInterface.removeColumn("patients", "notification_whatsapp_phone");
}
