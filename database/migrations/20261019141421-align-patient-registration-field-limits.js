/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
    // Expand the email column to match the registration requirements.
    await queryInterface.changeColumn("users", "email", {
        type: Sequelize.STRING(100),
        allowNull: false,
    });

    // Apply the documented maximum length to the optional address.
    await queryInterface.changeColumn("patients", "address", {
        type: Sequelize.STRING(150),
        allowNull: true,
    });
}

export async function down(queryInterface, Sequelize) {
    // Restore the original address column length.
    await queryInterface.changeColumn("patients", "address", {
        type: Sequelize.STRING(255),
        allowNull: true,
    });

    // Restore the original email column length.
    await queryInterface.changeColumn("users", "email", {
        type: Sequelize.STRING(80),
        allowNull: false,
    });
}
