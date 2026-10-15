
'use strict';

/**
 * Creates the audit log table to preserve traceability of user and system actions.
 */

export async function up(queryInterface, Sequelize) {
    // Store audit records independently from the lifecycle of user accounts.
    await queryInterface.createTable('audit_logs', {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
        },
        actor_user_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id',
            },
            // Preserve audit history if the actor's user account is deleted.
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
        },
        actor_snapshot: {
            type: Sequelize.STRING(100),
            allowNull: false,
        },
        action: {
            type: Sequelize.STRING(60),
            allowNull: false,
        },
        target_type: {
            type: Sequelize.STRING(60),
            allowNull: false,
        },
        target_id: {
            type: Sequelize.STRING(100),
            allowNull: true,
        },
        target_description: {
            type: Sequelize.STRING(255),
            allowNull: true,
        },
        changes: {
            type: Sequelize.JSON,
            allowNull: true,
        },
        reason: {
            type: Sequelize.STRING(500),
            allowNull: true,
        },
        result: {
            type: Sequelize.ENUM('Success', 'Failure'),
            allowNull: false,
        },
        occurred_at: {
            // Store timestamps consistently using the project's UTC convention.
            type: Sequelize.DATE,
            allowNull: false,
        },
    });

    // Index common audit queries without changing the recorded history.
    await queryInterface.addIndex('audit_logs', ['actor_user_id'], {
        name: 'audit_logs_actor_user_id_index',
    });

    await queryInterface.addIndex('audit_logs', ['target_type', 'target_id'], {
        name: 'audit_logs_target_type_target_id_index',
    });

    await queryInterface.addIndex('audit_logs', ['occurred_at'], {
        name: 'audit_logs_occurred_at_index',
    });
}

export async function down(queryInterface) {
    // Remove the table only when explicitly reverting this migration.
    await queryInterface.dropTable('audit_logs');
}
