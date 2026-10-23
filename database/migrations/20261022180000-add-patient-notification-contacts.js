/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
    // Store notification destinations separately from the patient's account contacts.
    await queryInterface.addColumn("patients", "notification_phone", {
        type: Sequelize.STRING(20),
        allowNull: true,
        after: "phone",
    });
    await queryInterface.addColumn("patients", "notification_email", {
        type: Sequelize.STRING(254),
        allowNull: true,
        after: "notification_phone",
    });
}

export async function down(queryInterface) {
    await queryInterface.removeColumn("patients", "notification_email");
    await queryInterface.removeColumn("patients", "notification_phone");
}
