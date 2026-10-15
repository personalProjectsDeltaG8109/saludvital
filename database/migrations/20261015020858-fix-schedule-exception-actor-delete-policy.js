
"use strict";

// Update the deletion policy for the user who created a schedule exception.
export async function up(queryInterface) {
    // Remove the existing foreign key before changing its deletion behavior.
    await queryInterface.removeConstraint(
        "doctor_schedule_exceptions",
        "doctor_schedule_exceptions_ibfk_2",
    );

    // Preserve the schedule exception if its creator account is deleted.
    await queryInterface.addConstraint("doctor_schedule_exceptions", {
        fields: ["created_by"],
        type: "foreign key",
        name: "doctor_schedule_exceptions_created_by_fk",
        references: {
            table: "users",
            field: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
    });
}

// Restore the original deletion policy when reverting the migration.
export async function down(queryInterface) {
    await queryInterface.removeConstraint(
        "doctor_schedule_exceptions",
        "doctor_schedule_exceptions_created_by_fk",
    );

    await queryInterface.addConstraint("doctor_schedule_exceptions", {
        fields: ["created_by"],
        type: "foreign key",
        name: "doctor_schedule_exceptions_ibfk_2",
        references: {
            table: "users",
            field: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
    });
}
