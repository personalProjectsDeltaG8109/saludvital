export async function up(queryInterface, Sequelize) {
    await queryInterface.addColumn("users", "failed_login_attempts", {
        type: Sequelize.SMALLINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        after: "last_login_at",
    });
    await queryInterface.addColumn("users", "login_locked_until", {
        type: Sequelize.DATE,
        allowNull: true,
        after: "failed_login_attempts",
    });
}

export async function down(queryInterface) {
    await queryInterface.removeColumn("users", "login_locked_until");
    await queryInterface.removeColumn("users", "failed_login_attempts");
}
