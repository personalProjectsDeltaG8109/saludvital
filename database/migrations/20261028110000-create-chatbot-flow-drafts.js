"use strict";

export async function up(queryInterface, Sequelize) {
    await queryInterface.createTable("chatbot_flows", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable("chatbot_flow_versions", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        flow_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            references: { model: "chatbot_flows", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        },
        version_number: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
        name: { type: Sequelize.STRING(100), allowNull: false },
        description: { type: Sequelize.STRING(500), allowNull: false, defaultValue: "" },
        status: {
            type: Sequelize.ENUM("Draft"),
            allowNull: false,
            defaultValue: "Draft",
        },
        definition: { type: Sequelize.JSON, allowNull: false },
        created_by: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        },
        created_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addConstraint("chatbot_flow_versions", {
        fields: ["flow_id", "version_number"],
        type: "unique",
        name: "chatbot_flow_versions_flow_version_unique",
    });
    await queryInterface.addIndex("chatbot_flow_versions", ["flow_id", "created_at"], {
        name: "chatbot_flow_versions_flow_created_index",
    });
}

export async function down(queryInterface) {
    await queryInterface.dropTable("chatbot_flow_versions");
    await queryInterface.dropTable("chatbot_flows");
}
