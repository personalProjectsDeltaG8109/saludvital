"use strict";

import bcrypt from "bcrypt";

// Create development-only accounts to test authentication by role.
export async function up(queryInterface) {
    // Prevent accidental creation of test accounts in production.
    if (process.env.NODE_ENV === "production") {
        throw new Error("Development auth users cannot be seeded in production.");
    }

    const { QueryTypes } = queryInterface.sequelize.Sequelize;
    const timestamp = new Date();

    // Retrieve role IDs instead of assuming database identifiers.
    const roles = await queryInterface.sequelize.query(
        "SELECT id, name FROM roles WHERE name IN (:names)",
        {
            replacements: {
                names: ["Patient", "Doctor", "Administrator"],
            },
            type: QueryTypes.SELECT,
        },
    );

    const roleIds = Object.fromEntries(roles.map((role) => [role.name, role.id]));

    for (const roleName of ["Patient", "Doctor", "Administrator"]) {
        if (!roleIds[roleName]) {
            throw new Error(`Required role not found: ${roleName}`);
        }
    }

    // Create or reuse an active medical specialty for the test doctor.
    let specialties = await queryInterface.sequelize.query(
        "SELECT id FROM specialties WHERE name = :name LIMIT 1",
        {
            replacements: { name: "General Medicine" },
            type: QueryTypes.SELECT,
        },
    );

    if (specialties.length === 0) {
        await queryInterface.bulkInsert("specialties", [
            {
                name: "General Medicine",
                description: "Development test specialty.",
                is_active: true,
                created_at: timestamp,
                updated_at: timestamp,
            },
        ]);

        specialties = await queryInterface.sequelize.query(
            "SELECT id FROM specialties WHERE name = :name LIMIT 1",
            {
                replacements: { name: "General Medicine" },
                type: QueryTypes.SELECT,
            },
        );
    }

    const specialtyId = specialties[0]?.id;

    if (!specialtyId) {
        throw new Error("Could not retrieve the test specialty.");
    }

    // These credentials are exclusively for local development and testing.
    const password = "SaludVitalTest2026!";
    const passwordHash = await bcrypt.hash(password, 12);

    const accounts = [
        {
            email: "admin.test@saludvital.local",
            role: "Administrator",
        },
        {
            email: "doctor.test@saludvital.local",
            role: "Doctor",
        },
        {
            email: "test@saludvital.local",
            role: "Patient",
        },
    ];

    const userIds = {};

    // Insert missing accounts and preserve existing user records.
    for (const account of accounts) {
        let users = await queryInterface.sequelize.query(
            "SELECT id, role_id FROM users WHERE email = :email LIMIT 1",
            {
                replacements: { email: account.email },
                type: QueryTypes.SELECT,
            },
        );

        if (users.length === 0) {
            await queryInterface.bulkInsert("users", [
                {
                    role_id: roleIds[account.role],
                    email: account.email,
                    password_hash: passwordHash,
                    is_active: true,
                    last_login_at: null,
                    created_at: timestamp,
                    updated_at: timestamp,
                },
            ]);

            users = await queryInterface.sequelize.query(
                "SELECT id, role_id FROM users WHERE email = :email LIMIT 1",
                {
                    replacements: { email: account.email },
                    type: QueryTypes.SELECT,
                },
            );
        }

        const user = users[0];

        if (!user || Number(user.role_id) !== Number(roleIds[account.role])) {
            throw new Error(`Existing account has an unexpected role: ${account.email}`);
        }

        userIds[account.role] = user.id;
    }

    // Create a patient profile only if one does not already exist.
    const patientProfiles = await queryInterface.sequelize.query(
        "SELECT id FROM patients WHERE user_id = :userId LIMIT 1",
        {
            replacements: { userId: userIds.Patient },
            type: QueryTypes.SELECT,
        },
    );

    if (patientProfiles.length === 0) {
        await queryInterface.bulkInsert("patients", [
            {
                user_id: userIds.Patient,
                first_name: "Test",
                last_name: "Patient",
                phone: "3000000001",
                date_of_birth: "1995-01-15",
                document_type: "CC",
                document_number: "TEST000001",
                department: "Risaralda",
                municipality: "Pereira",
                created_at: timestamp,
                updated_at: timestamp,
            },
        ]);
    }

    // Create a doctor profile only if one does not already exist.
    const doctorProfiles = await queryInterface.sequelize.query(
        "SELECT id FROM doctors WHERE user_id = :userId LIMIT 1",
        {
            replacements: { userId: userIds.Doctor },
            type: QueryTypes.SELECT,
        },
    );

    if (doctorProfiles.length === 0) {
        await queryInterface.bulkInsert("doctors", [
            {
                user_id: userIds.Doctor,
                specialty_id: specialtyId,
                professional_information: "Development test doctor.",
                created_at: timestamp,
                updated_at: timestamp,
            },
        ]);
    }
}

// Preserve development test records during rollback.
export async function down() {
    // Intentionally keep test records to avoid deleting referenced data.
}
