"use strict";

export async function up(queryInterface, Sequelize) {
    await queryInterface.createTable("patient_appointment_history_reads", {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        patient_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            references: { model: "patients", key: "id" },
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

    await queryInterface.addConstraint("patient_appointment_history_reads", {
        fields: ["patient_id", "appointment_history_id"],
        type: "unique",
        name: "patient_appointment_history_reads_unique_event",
    });
    await queryInterface.addIndex("patient_appointment_history_reads", ["patient_id"], {
        name: "patient_appointment_history_reads_patient_index",
    });
}

export async function down(queryInterface) {
    await queryInterface.dropTable("patient_appointment_history_reads");
}
