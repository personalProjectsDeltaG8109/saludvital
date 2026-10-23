"use strict";

// Add a slot duration to a Colombian local date-time without shifting its timezone.
function addThirtyMinutes(localDateTime) {
    const localDate = new Date(`${localDateTime.replace(" ", "T")}Z`);
    localDate.setUTCMinutes(localDate.getUTCMinutes() + 30);

    // Keep the result as a MySQL local datetime string instead of a UTC Date object.
    return localDate.toISOString().slice(0, 19).replace("T", " ");
}

// Add clearly labeled sample clinical records for the development patient account.
export async function up(queryInterface) {
    // Prevent fictional clinical data from being inserted into production.
    if (process.env.NODE_ENV === "production") {
        throw new Error("Development clinical history cannot be seeded in production.");
    }

    const { QueryTypes } = queryInterface.sequelize.Sequelize;
    const timestamp = new Date();

    // Resolve the development patient and doctor without relying on database IDs.
    const patients = await queryInterface.sequelize.query(
        `SELECT p.id
         FROM patients p
         INNER JOIN users u ON u.id = p.user_id
         WHERE u.email = :email
         LIMIT 1`,
        {
            replacements: { email: "patient.test@saludvital.local" },
            type: QueryTypes.SELECT,
        },
    );
    const doctors = await queryInterface.sequelize.query(
        `SELECT d.id, d.specialty_id
         FROM doctors d
         INNER JOIN users u ON u.id = d.user_id
         WHERE u.email = :email
         LIMIT 1`,
        {
            replacements: { email: "doctor.test@saludvital.local" },
            type: QueryTypes.SELECT,
        },
    );
    const attendedStatuses = await queryInterface.sequelize.query(
        "SELECT id FROM appointment_statuses WHERE name = :name LIMIT 1",
        {
            replacements: { name: "Attended" },
            type: QueryTypes.SELECT,
        },
    );

    const patient = patients[0];
    const doctor = doctors[0];
    const attendedStatus = attendedStatuses[0];

    // Stop if the required development fixtures have not been prepared.
    if (!patient || !doctor || !attendedStatus) {
        throw new Error(
            "Run the development auth, appointment, and status seeders before clinical history data.",
        );
    }

    // Attach the local fictional portrait to the development doctor profile.
    await queryInterface.bulkUpdate(
        "doctors",
        {
            profile_photo_url: "/brand/patient/doctor-test-profile.png",
            updated_at: timestamp,
        },
        { id: doctor.id },
    );

    // Give the development account the requested display name without changing its login.
    await queryInterface.bulkUpdate(
        "patients",
        { first_name: "Juan Esteban", last_name: "Montoya Marín", updated_at: timestamp },
        { id: patient.id },
    );

    const sampleConsultations = [
        {
            key: "01",
            startedAt: "2026-10-01 08:00:00",
            symptoms: "REGISTRO DE PRUEBA: consulta preventiva ficticia.",
            notes: "REGISTRO DE PRUEBA: nota clínica ficticia, sin validez médica.",
            vitals: {
                blood_pressure: "120/80 mmHg (demo)",
                heart_rate: "72 lpm (demo)",
                temperature: "36.5 °C (demo)",
            },
            diagnosis: "DEMO: control preventivo ficticio",
            diagnosisNotes: "Dato de demostración; no corresponde a un diagnóstico real.",
            prescription: "DEMO prescription 01",
            item: {
                medication_name: "Producto demostrativo 01",
                dosage: "Dato de prueba",
                frequency: "Dato de prueba",
                duration: "Dato de prueba",
                instructions:
                    "Registro ficticio para revisar la interfaz; no usar como indicación.",
            },
        },
        {
            key: "02",
            startedAt: "2026-09-10 10:30:00",
            symptoms: "REGISTRO DE PRUEBA: seguimiento ficticio.",
            notes: "REGISTRO DE PRUEBA: evaluación de ejemplo, sin validez médica.",
            vitals: {
                blood_pressure: "118/78 mmHg (demo)",
                heart_rate: "70 lpm (demo)",
                oxygen_saturation: "98 % (demo)",
            },
            diagnosis: "DEMO: seguimiento general ficticio",
            diagnosisNotes: "Dato de demostración; no corresponde a un diagnóstico real.",
            prescription: "DEMO prescription 02",
            item: {
                medication_name: "Producto demostrativo 02",
                dosage: "Dato de prueba",
                frequency: "Dato de prueba",
                duration: "Dato de prueba",
                instructions:
                    "Registro ficticio para revisar la interfaz; no usar como indicación.",
            },
        },
        {
            key: "03",
            startedAt: "2026-08-05 14:00:00",
            symptoms: "REGISTRO DE PRUEBA: consulta de control ficticia.",
            notes: "REGISTRO DE PRUEBA: observaciones de ejemplo, sin validez médica.",
            vitals: {
                temperature: "36.7 °C (demo)",
                weight: "68 kg (demo)",
                height: "1.70 m (demo)",
            },
            diagnosis: "DEMO: consulta de control ficticia",
            diagnosisNotes: "Dato de demostración; no corresponde a un diagnóstico real.",
            prescription: "DEMO prescription 03",
            item: {
                medication_name: "Producto demostrativo 03",
                dosage: "Dato de prueba",
                frequency: "Dato de prueba",
                duration: "Dato de prueba",
                instructions:
                    "Registro ficticio para revisar la interfaz; no usar como indicación.",
            },
        },
    ];

    for (const sample of sampleConsultations) {
        const appointmentReason = `DEVELOPMENT CLINICAL HISTORY SAMPLE ${sample.key}`;
        let appointments = await queryInterface.sequelize.query(
            `SELECT id
             FROM appointments
             WHERE patient_id = :patientId AND reason = :reason
             LIMIT 1`,
            {
                replacements: { patientId: patient.id, reason: appointmentReason },
                type: QueryTypes.SELECT,
            },
        );

        // Create an attended appointment only once for each sample consultation.
        if (appointments.length === 0) {
            await queryInterface.bulkInsert("appointments", [
                {
                    patient_id: patient.id,
                    doctor_id: doctor.id,
                    specialty_id: doctor.specialty_id,
                    status_id: attendedStatus.id,
                    start_at: sample.startedAt,
                    end_at: addThirtyMinutes(sample.startedAt),
                    reason: appointmentReason,
                    source: "Web",
                    created_at: timestamp,
                    updated_at: timestamp,
                },
            ]);

            appointments = await queryInterface.sequelize.query(
                `SELECT id
                 FROM appointments
                 WHERE patient_id = :patientId AND reason = :reason
                 LIMIT 1`,
                {
                    replacements: { patientId: patient.id, reason: appointmentReason },
                    type: QueryTypes.SELECT,
                },
            );
        }

        const appointment = appointments[0];
        let consultations = await queryInterface.sequelize.query(
            "SELECT id FROM consultations WHERE appointment_id = :appointmentId LIMIT 1",
            {
                replacements: { appointmentId: appointment.id },
                type: QueryTypes.SELECT,
            },
        );

        // Store a completed consultation with sample notes and vital signs.
        if (consultations.length === 0) {
            await queryInterface.bulkInsert("consultations", [
                {
                    appointment_id: appointment.id,
                    doctor_id: doctor.id,
                    started_at: sample.startedAt,
                    ended_at: addThirtyMinutes(sample.startedAt),
                    duration_seconds: 1800,
                    symptoms: sample.symptoms,
                    patient_feeling: "REGISTRO DE PRUEBA: percepción del paciente ficticia.",
                    vital_signs: JSON.stringify(sample.vitals),
                    clinical_notes: sample.notes,
                    status: "Completed",
                    interruption_reason: null,
                    created_at: timestamp,
                    updated_at: timestamp,
                },
            ]);

            consultations = await queryInterface.sequelize.query(
                "SELECT id FROM consultations WHERE appointment_id = :appointmentId LIMIT 1",
                {
                    replacements: { appointmentId: appointment.id },
                    type: QueryTypes.SELECT,
                },
            );
        }

        const consultation = consultations[0];
        const existingDiagnoses = await queryInterface.sequelize.query(
            `SELECT id FROM diagnoses
             WHERE consultation_id = :consultationId AND diagnosis = :diagnosis
             LIMIT 1`,
            {
                replacements: {
                    consultationId: consultation.id,
                    diagnosis: sample.diagnosis,
                },
                type: QueryTypes.SELECT,
            },
        );

        // Add the sample diagnosis only if this development record does not have it yet.
        if (existingDiagnoses.length === 0) {
            await queryInterface.bulkInsert("diagnoses", [
                {
                    consultation_id: consultation.id,
                    diagnosis: sample.diagnosis,
                    notes: sample.diagnosisNotes,
                    created_at: timestamp,
                    updated_at: timestamp,
                },
            ]);
        }

        let prescriptions = await queryInterface.sequelize.query(
            `SELECT id FROM prescriptions
             WHERE consultation_id = :consultationId AND notes = :notes
             LIMIT 1`,
            {
                replacements: {
                    consultationId: consultation.id,
                    notes: sample.prescription,
                },
                type: QueryTypes.SELECT,
            },
        );

        // Create a clearly identified sample prescription for the clinical-history view.
        if (prescriptions.length === 0) {
            await queryInterface.bulkInsert("prescriptions", [
                {
                    consultation_id: consultation.id,
                    issued_at: sample.startedAt,
                    notes: sample.prescription,
                    created_at: timestamp,
                    updated_at: timestamp,
                },
            ]);

            prescriptions = await queryInterface.sequelize.query(
                `SELECT id FROM prescriptions
                 WHERE consultation_id = :consultationId AND notes = :notes
                 LIMIT 1`,
                {
                    replacements: {
                        consultationId: consultation.id,
                        notes: sample.prescription,
                    },
                    type: QueryTypes.SELECT,
                },
            );
        }

        const prescription = prescriptions[0];
        const existingItems = await queryInterface.sequelize.query(
            `SELECT id FROM prescription_items
             WHERE prescription_id = :prescriptionId AND medication_name = :medicationName
             LIMIT 1`,
            {
                replacements: {
                    prescriptionId: prescription.id,
                    medicationName: sample.item.medication_name,
                },
                type: QueryTypes.SELECT,
            },
        );

        // Add one fictitious item without duplicating it on repeated seeder runs.
        if (existingItems.length === 0) {
            await queryInterface.bulkInsert("prescription_items", [
                {
                    prescription_id: prescription.id,
                    ...sample.item,
                    created_at: timestamp,
                    updated_at: timestamp,
                },
            ]);
        }
    }
}

// Preserve development clinical records during rollback for audit-safe local data.
export async function down() {
    // Intentionally keep clearly labeled development records.
}
