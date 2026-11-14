"use strict";

export async function up(queryInterface, Sequelize) {
    await queryInterface.createTable("patient_consents", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        user_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        },
        consent_scope: {
            type: Sequelize.STRING(80),
            allowNull: false,
        },
        notice_version: {
            type: Sequelize.STRING(20),
            allowNull: false,
        },
        accepted_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
    });

    await queryInterface.addIndex("patient_consents", ["user_id", "accepted_at"], {
        name: "patient_consents_user_accepted_index",
    });
}

// Drop only the new table when rolling back this additive migration.
export async function down(queryInterface) {
    await queryInterface.dropTable("patient_consents");
}
