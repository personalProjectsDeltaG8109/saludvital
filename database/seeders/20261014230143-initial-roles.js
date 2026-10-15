"use strict";

// Insert the initial roles defined in the SaludVital database design.
export async function up(queryInterface) {
    // Define the three roles required by the application.
    const roles = [
        {
            name: "Patient",
            description: "User who requests and manages medical appointments.",
        },
        {
            name: "Doctor",
            description:
                "Healthcare professional who manages medical availability and appointments.",
        },
        {
            name: "Administrator",
            description: "User who administers the application and its configuration.",
        },
    ];

    // Use a single UTC timestamp for all initial role records.
    const timestamp = new Date();

    // Insert only roles that do not already exist, preserving existing records.
    for (const role of roles) {
        const existingRoles = await queryInterface.sequelize.query(
            "SELECT id FROM roles WHERE name = :name LIMIT 1",
            {
                replacements: { name: role.name },
                type: queryInterface.sequelize.QueryTypes.SELECT,
            },
        );

        if (existingRoles.length === 0) {
            await queryInterface.bulkInsert("roles", [
                {
                    ...role,
                    created_at: timestamp,
                    updated_at: timestamp,
                },
            ]);
        }
    }
}

// Preserve foundational roles during rollback to protect existing users.
export async function down() {
    // Intentionally keep the initial roles and their existing references.
}
