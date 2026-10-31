/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("users", "email", {
        type: Sequelize.STRING(320),
        allowNull: false,
    });
}

export async function down(queryInterface, Sequelize) {
    const [rows] = await queryInterface.sequelize.query(
        "SELECT 1 FROM users WHERE CHAR_LENGTH(email) > 100 LIMIT 1",
    );

    if (rows.length > 0) {
        throw new Error("Cannot shrink users.email while longer email addresses exist.");
    }

    await queryInterface.changeColumn("users", "email", {
        type: Sequelize.STRING(100),
        allowNull: false,
    });
}
