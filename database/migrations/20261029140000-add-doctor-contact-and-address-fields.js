export async function up(queryInterface, Sequelize) {
    await queryInterface.addColumn("doctors", "alternate_phone", {
        type: Sequelize.STRING(20),
        allowNull: true,
        after: "profile_photo_url",
    });
    await queryInterface.addColumn("doctors", "address", {
        type: Sequelize.STRING(150),
        allowNull: true,
        after: "alternate_phone",
    });
    await queryInterface.addColumn("doctors", "department", {
        type: Sequelize.STRING(100),
        allowNull: true,
        after: "address",
    });
    await queryInterface.addColumn("doctors", "municipality", {
        type: Sequelize.STRING(100),
        allowNull: true,
        after: "department",
    });
}

export async function down(queryInterface) {
    await queryInterface.removeColumn("doctors", "municipality");
    await queryInterface.removeColumn("doctors", "department");
    await queryInterface.removeColumn("doctors", "address");
    await queryInterface.removeColumn("doctors", "alternate_phone");
}
