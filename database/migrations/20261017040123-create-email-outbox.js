"use strict";

// Store email delivery jobs durably for retry after temporary SMTP failures.
export async function up(queryInterface, Sequelize) {
    await queryInterface.createTable("email_outbox", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        user_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            references: {
                model: "users",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
        },
        event_type: {
            type: Sequelize.STRING(50),
            allowNull: false,
        },
        status: {
            type: Sequelize.ENUM("pending", "processing", "sent", "failed"),
            allowNull: false,
            defaultValue: "pending",
        },
        attempts: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        next_attempt_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
        locked_at: {
            type: Sequelize.DATE,
            allowNull: true,
        },
        sent_at: {
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

    // Index due jobs for efficient worker polling.
    await queryInterface.addIndex("email_outbox", ["status", "next_attempt_at"], {
        name: "email_outbox_pending_jobs_idx",
    });

    await queryInterface.addIndex("email_outbox", ["user_id", "event_type"], {
        name: "email_outbox_user_event_idx",
    });
}

// Remove indexes before dropping the outbox table.
export async function down(queryInterface) {
    await queryInterface.removeIndex("email_outbox", "email_outbox_user_event_idx");

    await queryInterface.removeIndex("email_outbox", "email_outbox_pending_jobs_idx");

    await queryInterface.dropTable("email_outbox");
}
