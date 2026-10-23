"use strict";

// Add reusable doctor availability and one appointment for local development.
export async function up(queryInterface) {
    // Prevent test records from being added to a production database.
    if (process.env.NODE_ENV === "production") {
        throw new Error("Development appointment data cannot be seeded in production.");
    }

    const { QueryTypes } = queryInterface.sequelize.Sequelize;
    const timestamp = new Date();

    // Find the doctor account created by the existing development seeder.
    const doctors = await queryInterface.sequelize.query(
        `SELECT d.id, d.specialty_id, d.user_id
         FROM doctors d
         INNER JOIN users u ON u.id = d.user_id
         WHERE u.email = :email
         LIMIT 1`,
        {
            replacements: { email: "doctor.test@saludvital.local" },
            type: QueryTypes.SELECT,
        },
    );

    // Find the patient profile created by the existing development seeder.
    const patients = await queryInterface.sequelize.query(
        `SELECT p.id, p.user_id, p.first_name, p.last_name
         FROM patients p
         INNER JOIN users u ON u.id = p.user_id
         WHERE u.email = :email
         LIMIT 1`,
        {
            replacements: { email: "test@saludvital.local" },
            type: QueryTypes.SELECT,
        },
    );

    const doctor = doctors[0];
    const patient = patients[0];

    // Stop with a clear message if the base development accounts are missing.
    if (!doctor || !patient) {
        throw new Error(
            "Run the development auth seeder first to create the test doctor and patient.",
        );
    }

    // Calculate today's date using Colombia's UTC-5 timezone.
    const colombianNow = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const today = [
        colombianNow.getUTCFullYear(),
        String(colombianNow.getUTCMonth() + 1).padStart(2, "0"),
        String(colombianNow.getUTCDate()).padStart(2, "0"),
    ].join("-");

    // Create a daily schedule from 7:00 a. m. to 7:00 p. m. if it is missing.
    for (let dayOfWeek = 1; dayOfWeek <= 7; dayOfWeek += 1) {
        const existingAvailability = await queryInterface.sequelize.query(
            `SELECT id
             FROM doctor_availability
             WHERE doctor_id = :doctorId
               AND day_of_week = :dayOfWeek
               AND is_active = 1
               AND valid_from <= :today
               AND (valid_until IS NULL OR valid_until >= :today)
               AND start_time <= '07:00:00'
               AND end_time >= '19:00:00'
             LIMIT 1`,
            {
                replacements: {
                    doctorId: doctor.id,
                    dayOfWeek,
                    today,
                },
                type: QueryTypes.SELECT,
            },
        );

        if (existingAvailability.length === 0) {
            await queryInterface.bulkInsert("doctor_availability", [
                {
                    doctor_id: doctor.id,
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

    // Find the Confirmed status for the sample appointment.
    const statuses = await queryInterface.sequelize.query(
        `SELECT id
         FROM appointment_statuses
         WHERE name = :name
         LIMIT 1`,
        {
            replacements: { name: "Confirmed" },
            type: QueryTypes.SELECT,
        },
    );

    const confirmedStatus = statuses[0];

    if (!confirmedStatus) {
        throw new Error(
            "The Confirmed appointment status is missing. Run the status seeder first.",
        );
    }

    // Choose tomorrow at 9:00 a. m. in Colombia for the sample appointment.
    const tomorrow = new Date(
        Date.UTC(
            colombianNow.getUTCFullYear(),
            colombianNow.getUTCMonth(),
            colombianNow.getUTCDate() + 1,
        ),
    );
    const appointmentDate = [
        tomorrow.getUTCFullYear(),
        String(tomorrow.getUTCMonth() + 1).padStart(2, "0"),
        String(tomorrow.getUTCDate()).padStart(2, "0"),
    ].join("-");
    const startAt = `${appointmentDate} 09:00:00`;
    const endAt = `${appointmentDate} 09:30:00`;

    // Avoid inserting a second active appointment in the same doctor time slot.
    const existingAppointment = await queryInterface.sequelize.query(
        `SELECT a.id
         FROM appointments a
         INNER JOIN appointment_statuses s ON s.id = a.status_id
         WHERE a.doctor_id = :doctorId
           AND a.start_at < :endAt
           AND a.end_at > :startAt
           AND s.name <> 'Cancelled'
         LIMIT 1`,
        {
            replacements: {
                doctorId: doctor.id,
                startAt,
                endAt,
            },
            type: QueryTypes.SELECT,
        },
    );

    // Add the sample appointment only when the slot is not already occupied.
    if (existingAppointment.length === 0) {
        await queryInterface.bulkInsert("appointments", [
            {
                patient_id: patient.id,
                doctor_id: doctor.id,
                specialty_id: doctor.specialty_id,
                status_id: confirmedStatus.id,
                start_at: startAt,
                end_at: endAt,
                reason: "Cita de prueba para validar el flujo de reserva.",
                source: "Web",
                created_at: timestamp,
                updated_at: timestamp,
            },
        ]);
    }
}

// Keep development records during rollback to protect related database history.
export async function down() {
    // Intentionally preserve seeded development data.
}
