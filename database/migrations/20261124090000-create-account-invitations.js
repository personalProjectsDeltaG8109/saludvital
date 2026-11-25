"use strict";

export async function up(queryInterface, Sequelize) {
    await queryInterface.createTable("account_invitations", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        user_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            unique: true,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
        },
        invited_by_user_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: true,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
        },
        token_hash: {
            type: Sequelize.STRING(64),
            allowNull: true,
            unique: true,
        },
        expires_at: {
            type: Sequelize.DATE,
            allowNull: true,
        },
        accepted_at: {
            type: Sequelize.DATE,
            allowNull: true,
        },
        cancelled_at: {
            type: Sequelize.DATE,
            allowNull: true,
        },
        created_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
        updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
    });

    await queryInterface.addIndex("account_invitations", ["expires_at", "accepted_at"], {
        name: "account_invitations_pending_idx",
    });
}

export async function down(queryInterface) {
    await queryInterface.removeIndex("account_invitations", "account_invitations_pending_idx");
    await queryInterface.dropTable("account_invitations");
}
