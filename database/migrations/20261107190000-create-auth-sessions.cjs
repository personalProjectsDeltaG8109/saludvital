"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("auth_sessions", {
            session_id_hash: {
                type: Sequelize.STRING(64),
                primaryKey: true,
                allowNull: false,
            },
            user_id: {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: false,
                references: { model: "users", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "CASCADE",
            },
            last_activity_at: {
                type: Sequelize.DATE(3),
                allowNull: false,
            },
            created_at: {
                type: Sequelize.DATE(3),
                allowNull: false,
                defaultValue: Sequelize.literal("CURRENT_TIMESTAMP(3)"),
            },
        });

        await queryInterface.addIndex("auth_sessions", ["user_id"], {
            name: "idx_auth_sessions_user_id",
        });
        await queryInterface.addIndex("auth_sessions", ["last_activity_at"], {
            name: "idx_auth_sessions_last_activity",
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("auth_sessions");
    },
};
