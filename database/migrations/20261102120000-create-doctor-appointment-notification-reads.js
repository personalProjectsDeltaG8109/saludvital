"use strict";

export async function up(queryInterface, Sequelize) {
    await queryInterface.createTable("doctor_appointment_notification_reads", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        doctor_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            references: { model: "doctors", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
        },
        appointment_history_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            references: { model: "appointment_history", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
        },
        read_at: {
            type: Sequelize.DATE,
            allowNull: false,
        },
    });

    await queryInterface.addConstraint("doctor_appointment_notification_reads", {
        fields: ["doctor_id", "appointment_history_id"],
        type: "unique",
        name: "doctor_appointment_notification_reads_unique_event",
    });
    await queryInterface.addIndex("doctor_appointment_notification_reads", ["doctor_id"], {
        name: "doctor_appointment_notification_reads_doctor_index",
    });
}

export async function down(queryInterface) {
    await queryInterface.dropTable("doctor_appointment_notification_reads");
}
