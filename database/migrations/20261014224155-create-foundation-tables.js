"use strict";

// Create the foundational tables required by SaludVital.
export async function up(queryInterface, Sequelize) {

    // Store the application roles defined by the approved database design.
    await queryInterface.createTable("roles", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        name: {
            type: Sequelize.STRING(30),
            allowNull: false,
            unique: true,
        },
        description: {
            type: Sequelize.STRING(255),
            allowNull: true,
        },
        // Store required timestamps without undocumented defaults.
        created_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
        updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
    });


    // Store user credentials and associate each account with a role.
    await queryInterface.createTable("users", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        role_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            references: {
                model: "roles",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        },
        email: {
            type: Sequelize.STRING(80),
            allowNull: false,
            unique: true,
        },
        password_hash: {
            type: Sequelize.STRING(255),
            allowNull: false,
        },
        is_active: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        // Store the last successful login timestamp using the UTC convention.
        last_login_at: {
            type: Sequelize.DATE,
            allowNull: true,
        },
        // Require explicit timestamps to follow the documented schema.
        created_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
        updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
    });

    // Store medical specialties according to the approved database schema.
    await queryInterface.createTable("specialties", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        name: {
            type: Sequelize.STRING(100),
            allowNull: false,
            unique: true,
        },
        description: {
            type: Sequelize.STRING(255),
            allowNull: true,
        },
        is_active: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        // These timestamps are required and have no documented default.
        created_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
        updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
    });
}

// Remove the foundational tables in reverse dependency order.
export async function down(queryInterface) {
    await queryInterface.dropTable("specialties");
    await queryInterface.dropTable("users");
    await queryInterface.dropTable("roles");
}
