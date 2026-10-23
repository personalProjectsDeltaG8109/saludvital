"use strict";

import bcrypt from "bcrypt";

// Create three fictional doctors with distinct specialties and local profile photos.
export async function up(queryInterface) {
    // Keep fictional clinician profiles out of production data.
    if (process.env.NODE_ENV === "production") {
        throw new Error("Development doctor profiles cannot be seeded in production.");
    }

    const { QueryTypes } = queryInterface.sequelize.Sequelize;
    const timestamp = new Date();
    const colombianNow = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const today = [
        colombianNow.getUTCFullYear(),
        String(colombianNow.getUTCMonth() + 1).padStart(2, "0"),
        String(colombianNow.getUTCDate()).padStart(2, "0"),
    ].join("-");
    const doctorProfiles = [
        {
            email: "doctor.test@saludvital.local",
            displayName: "Dr. Carlos Ramírez",
            specialtyName: "General Medicine",
            specialtyDescription: "Development sample specialty for general medical care.",
            photoUrl: "/brand/patient/doctor-carlos-ramirez.png",
            information: "Médico general de prueba para el portal del paciente.",
        },
        {
            email: "doctor.pediatrics.test@saludvital.local",
            displayName: "Dra. Valentina Ríos",
            specialtyName: "Pediatrics",
            specialtyDescription: "Development sample specialty for pediatric care.",
            photoUrl: "/brand/patient/doctor-valentina-rios.png",
            information: "Pediatra de prueba para el portal del paciente.",
        },
        {
            email: "doctor.dermatology.test@saludvital.local",
            displayName: "Dra. Camila Torres",
            specialtyName: "Dermatology",
            specialtyDescription: "Development sample specialty for dermatological care.",
            photoUrl: "/brand/patient/doctor-camila-torres.png",
            information: "Dermatóloga de prueba para el portal del paciente.",
        },
    ];

    const roles = await queryInterface.sequelize.query(
        "SELECT id FROM roles WHERE name = :name LIMIT 1",
        { replacements: { name: "Doctor" }, type: QueryTypes.SELECT },
    );
    const doctorRoleId = roles[0]?.id;

    if (!doctorRoleId) throw new Error("The Doctor role must be seeded before doctor profiles.");

    // Use the existing development-only account password for missing doctor accounts.
    const passwordHash = await bcrypt.hash("SaludVitalTest2026!", 12);

    for (const profile of doctorProfiles) {
        let specialties = await queryInterface.sequelize.query(
            "SELECT id FROM specialties WHERE name = :name LIMIT 1",
            { replacements: { name: profile.specialtyName }, type: QueryTypes.SELECT },
        );

        // Create missing specialties and activate existing development specialties.
        if (!specialties.length) {
            await queryInterface.bulkInsert("specialties", [
                {
                    name: profile.specialtyName,
                    description: profile.specialtyDescription,
                    is_active: true,
                    created_at: timestamp,
                    updated_at: timestamp,
                },
            ]);
            specialties = await queryInterface.sequelize.query(
                "SELECT id FROM specialties WHERE name = :name LIMIT 1",
                { replacements: { name: profile.specialtyName }, type: QueryTypes.SELECT },
            );
        } else {
            await queryInterface.bulkUpdate(
                "specialties",
                { is_active: true, updated_at: timestamp },
                { id: specialties[0].id },
            );
        }

        const specialtyId = specialties[0]?.id;
        let users = await queryInterface.sequelize.query(
            "SELECT id, role_id FROM users WHERE email = :email LIMIT 1",
            { replacements: { email: profile.email }, type: QueryTypes.SELECT },
        );

        // Add an active doctor account when this development fixture is missing.
        if (!users.length) {
            await queryInterface.bulkInsert("users", [
                {
                    role_id: doctorRoleId,
                    email: profile.email,
                    password_hash: passwordHash,
                    is_active: true,
                    last_login_at: null,
                    created_at: timestamp,
                    updated_at: timestamp,
                },
            ]);
            users = await queryInterface.sequelize.query(
                "SELECT id, role_id FROM users WHERE email = :email LIMIT 1",
                { replacements: { email: profile.email }, type: QueryTypes.SELECT },
            );
        }

        const user = users[0];
        if (!user || Number(user.role_id) !== Number(doctorRoleId)) {
            throw new Error(`The development account has an unexpected role: ${profile.email}`);
        }

        // Ensure each account is enabled and linked to one named doctor profile.
        await queryInterface.bulkUpdate(
            "users",
            { is_active: true, updated_at: timestamp },
            { id: user.id },
        );

        const existingDoctors = await queryInterface.sequelize.query(
            "SELECT id FROM doctors WHERE user_id = :userId LIMIT 1",
            { replacements: { userId: user.id }, type: QueryTypes.SELECT },
        );
        const doctorValues = {
            specialty_id: specialtyId,
            display_name: profile.displayName,
            profile_photo_url: profile.photoUrl,
            professional_information: profile.information,
            updated_at: timestamp,
        };

        if (existingDoctors.length) {
            await queryInterface.bulkUpdate("doctors", doctorValues, {
                id: existingDoctors[0].id,
            });
        } else {
            await queryInterface.bulkInsert("doctors", [
                {
                    user_id: user.id,
                    ...doctorValues,
                    created_at: timestamp,
                },
            ]);
        }

        const doctors = await queryInterface.sequelize.query(
            "SELECT id FROM doctors WHERE user_id = :userId LIMIT 1",
            { replacements: { userId: user.id }, type: QueryTypes.SELECT },
        );
        const doctorId = doctors[0]?.id;

        // Give each development doctor weekly slots for booking-flow review.
        for (let dayOfWeek = 1; dayOfWeek <= 7; dayOfWeek += 1) {
            const availability = await queryInterface.sequelize.query(
                `SELECT id FROM doctor_availability
                 WHERE doctor_id = :doctorId
                   AND day_of_week = :dayOfWeek
                   AND is_active = 1
                   AND valid_from <= :today
                   AND (valid_until IS NULL OR valid_until >= :today)
                 LIMIT 1`,
                {
                    replacements: { doctorId, dayOfWeek, today },
                    type: QueryTypes.SELECT,
                },
            );

            if (!availability.length) {
                await queryInterface.bulkInsert("doctor_availability", [
                    {
                        doctor_id: doctorId,
                        day_of_week: dayOfWeek,
                        start_time: "07:00:00",
                        end_time: "19:00:00",
                        valid_from: today,
                        valid_until: null,
                        is_active: true,
                        created_at: timestamp,
                        updated_at: timestamp,
                    },
                ]);
            }
        }
    }
}

// Retain development profiles and schedules to avoid breaking related sample records.
export async function down() {
    // Intentionally preserve the local test fixtures.
}
