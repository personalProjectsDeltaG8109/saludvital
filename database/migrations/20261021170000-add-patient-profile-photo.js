/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
    await queryInterface.addColumn("patients", "profile_photo_url", {
        type: Sequelize.STRING(255),
        allowNull: true,
        after: "address",
    });
}

export async function down(queryInterface) {
    await queryInterface.removeColumn("patients", "profile_photo_url");
}
