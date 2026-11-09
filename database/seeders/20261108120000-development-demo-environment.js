"use strict";

import bcrypt from "bcrypt";
import {
    DEMO_ACCOUNTS,
    DEMO_PASSWORD,
    addDemoMinutes,
    formatDemoDateTime,
    getDemoAppointmentScenarios,
    getDemoClinicalRecords,
} from "../developmentDemoFixtures.js";

const DEMO_PREFIX = "DEMO SEED:";
const LEGACY_APPOINTMENT_REASONS = {
    confirmed: ["Cita de prueba para validar el flujo de reserva."],
    "attended-01": ["DEVELOPMENT CLINICAL HISTORY SAMPLE 01"],
    "attended-02": ["DEVELOPMENT CLINICAL HISTORY SAMPLE 02"],
    "attended-03": ["DEVELOPMENT CLINICAL HISTORY SAMPLE 03"],
};

async function selectRows(queryInterface, sql, replacements, transaction) {
    const { QueryTypes } = queryInterface.sequelize.Sequelize;
    return queryInterface.sequelize.query(sql, {
        replacements,
        type: QueryTypes.SELECT,
        transaction,
    });
}

async function ensureRoleIds(queryInterface, transaction) {
    const rows = await selectRows(
        queryInterface,
        "SELECT id, name FROM roles WHERE name IN (:names)",
        { names: ["Patient", "Doctor", "Administrator"] },
        transaction,
    );
    const roles = Object.fromEntries(rows.map(({ id, name }) => [name, id]));
    for (const role of ["Patient", "Doctor", "Administrator"]) {
        if (!roles[role]) throw new Error(`Required role not found: ${role}`);
    }
    return roles;
}

async function ensureStatusIds(queryInterface, transaction) {
    const rows = await selectRows(
        queryInterface,
        "SELECT id, name FROM appointment_statuses WHERE name IN (:names)",
        { names: ["Confirmed", "Attended", "Cancelled", "No Show"] },
        transaction,
    );
    const statuses = Object.fromEntries(rows.map(({ id, name }) => [name, id]));
    for (const status of ["Confirmed", "Attended", "Cancelled", "No Show"]) {
        if (!statuses[status]) throw new Error(`Required appointment status not found: ${status}`);
    }
    return statuses;
}

async function ensureAccount(
    queryInterface,
    account,
    roleIds,
    passwordHash,
    timestamp,
    transaction,
) {
    const roles = roleIds[account.role];
    const rows = await selectRows(
        queryInterface,
        "SELECT id, role_id FROM users WHERE email = :email LIMIT 1",
        { email: account.email },
        transaction,
    );
    const existing = rows[0];
    if (existing && Number(existing.role_id) !== Number(roles)) {
        throw new Error(`Demo account has an unexpected role: ${account.email}`);
    }

    const values = {
        role_id: roles,
        display_name: account.displayName,
        phone: account.role === "Administrator" ? "3000000200" : "3000000001",
        password_hash: passwordHash,
        is_active: true,
        admin_notifications_enabled: true,
        failed_login_attempts: 0,
        login_locked_until: null,
        email_verified_at: timestamp,
        email_verification_token_hash: null,
        email_verification_expires_at: null,
        updated_at: timestamp,
    };

    if (existing) {
        await queryInterface.bulkUpdate("users", values, { id: existing.id }, { transaction });
        return existing.id;
    }

    await queryInterface.bulkInsert(
        "users",
        [{ email: account.email, last_login_at: null, created_at: timestamp, ...values }],
        { transaction },
    );
    const created = await selectRows(
        queryInterface,
        "SELECT id FROM users WHERE email = :email LIMIT 1",
        { email: account.email },
        transaction,
    );
    if (!created[0]) throw new Error(`Could not create demo account: ${account.email}`);
    return created[0].id;
}

async function ensureSpecialty(queryInterface, account, timestamp, transaction) {
    const rows = await selectRows(
        queryInterface,
        "SELECT id FROM specialties WHERE name = :name LIMIT 1",
        { name: account.specialty },
        transaction,
    );
    const description = `DEMO: specialty for ${account.displayName}.`;
    if (rows[0]) {
        await queryInterface.bulkUpdate(
            "specialties",
            { description, is_active: true, updated_at: timestamp },
            { id: rows[0].id },
            { transaction },
        );
        return rows[0].id;
    }
    await queryInterface.bulkInsert(
        "specialties",
        [
            {
                name: account.specialty,
                description,
                is_active: true,
                created_at: timestamp,
                updated_at: timestamp,
            },
        ],
        { transaction },
    );
    const created = await selectRows(
        queryInterface,
        "SELECT id FROM specialties WHERE name = :name LIMIT 1",
        { name: account.specialty },
        transaction,
    );
    return created[0]?.id;
}

async function ensurePatient(queryInterface, userId, timestamp, transaction) {
    const rows = await selectRows(
        queryInterface,
        "SELECT id FROM patients WHERE user_id = :userId LIMIT 1",
        { userId },
        transaction,
    );
    const values = {
        first_name: "Paciente",
        last_name: "Demo",
        phone: "3000000001",
        notification_phone: "3000000001",
        notification_whatsapp_phone: "573000000001",
        notification_email: "test@saludvital.local",
        date_of_birth: "1995-01-15",
        document_type: "CC",
        document_number: "DEMO000001",
        department: "Risaralda",
        municipality: "Pereira",
        blood_type: null,
        allergies: "DEMO: dato ficticio; no usar para atención clínica.",
        existing_conditions: "DEMO: dato ficticio; no usar para atención clínica.",
        address: "Dirección ficticia para pruebas",
        updated_at: timestamp,
    };
    if (rows[0]) {
        await queryInterface.bulkUpdate("patients", values, { id: rows[0].id }, { transaction });
        return rows[0].id;
    }
    await queryInterface.bulkInsert(
        "patients",
        [{ user_id: userId, profile_photo_url: null, created_at: timestamp, ...values }],
        { transaction },
    );
    const created = await selectRows(
        queryInterface,
        "SELECT id FROM patients WHERE user_id = :userId LIMIT 1",
        { userId },
        transaction,
    );
    if (!created[0]) throw new Error("Could not create the demo patient profile.");
    return created[0].id;
}

async function ensureDoctor(queryInterface, account, userId, specialtyId, timestamp, transaction) {
    const rows = await selectRows(
        queryInterface,
        "SELECT id FROM doctors WHERE user_id = :userId LIMIT 1",
        { userId },
        transaction,
    );
    const values = {
        specialty_id: specialtyId,
        display_name: account.displayName,
        profile_photo_url: account.photo,
        professional_information: `DEMO: professional profile for ${account.displayName}.`,
        alternate_phone: "3000000201",
        address: "Dirección ficticia para pruebas",
        department: "Risaralda",
        municipality: "Pereira",
        updated_at: timestamp,
    };
    if (rows[0]) {
        await queryInterface.bulkUpdate("doctors", values, { id: rows[0].id }, { transaction });
        return rows[0].id;
    }
    await queryInterface.bulkInsert(
        "doctors",
        [{ user_id: userId, created_at: timestamp, ...values }],
        { transaction },
    );
    const created = await selectRows(
        queryInterface,
        "SELECT id FROM doctors WHERE user_id = :userId LIMIT 1",
        { userId },
        transaction,
    );
    if (!created[0]) throw new Error(`Could not create demo doctor: ${account.email}`);
    return created[0].id;
}

async function ensureAvailability(queryInterface, doctorId, today, timestamp, transaction) {
    await queryInterface.sequelize.query(
        `UPDATE doctor_availability
         SET is_active = 0, updated_at = :timestamp
         WHERE doctor_id = :doctorId AND is_active = 1
           AND NOT (start_time = '07:00:00' AND end_time = '19:00:00'
                    AND valid_from <= :today AND (valid_until IS NULL OR valid_until >= :today))`,
        { replacements: { doctorId, today, timestamp }, transaction },
    );
    for (let dayOfWeek = 1; dayOfWeek <= 7; dayOfWeek += 1) {
        const rows = await selectRows(
            queryInterface,
            `SELECT id FROM doctor_availability
             WHERE doctor_id = :doctorId AND day_of_week = :dayOfWeek
               AND start_time = '07:00:00' AND end_time = '19:00:00'
               AND is_active = 1 AND valid_from <= :today
               AND (valid_until IS NULL OR valid_until >= :today)
             LIMIT 1`,
            { doctorId, dayOfWeek, today },
            transaction,
        );
        if (!rows.length) {
            await queryInterface.bulkInsert(
                "doctor_availability",
                [
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
                ],
                { transaction },
            );
        }
    }
}

async function upsertAppointment(
    queryInterface,
    scenario,
    patientId,
    doctor,
    statusId,
    timestamp,
    transaction,
) {
    const seedReason = `${DEMO_PREFIX} APPOINTMENT:${scenario.key}`;
    const seedPattern = `${seedReason}%`;
    const legacyReasons = LEGACY_APPOINTMENT_REASONS[scenario.key] || [];
    const legacyFilter = legacyReasons.length ? "OR reason IN (:legacyReasons)" : "";
    const rows = await selectRows(
        queryInterface,
        `SELECT id FROM appointments
         WHERE patient_id = :patientId
           AND (reason LIKE :seedPattern ${legacyFilter})
         ORDER BY CASE WHEN reason LIKE :seedPattern THEN 0 ELSE 1 END
         LIMIT 1`,
        {
            patientId,
            seedPattern,
            ...(legacyReasons.length ? { legacyReasons } : {}),
        },
        transaction,
    );
    const values = {
        patient_id: patientId,
        doctor_id: doctor.id,
        specialty_id: doctor.specialtyId,
        status_id: statusId,
        start_at: scenario.startAt,
        end_at: scenario.endAt,
        reason: `${seedReason} — ${scenario.reason}`,
        source: ["confirmed", "cancelled", "rescheduled"].includes(scenario.key) ? "Admin" : "Web",
        created_at: scenario.createdAt,
        updated_at: timestamp,
    };
    let id = rows[0]?.id;
    if (id) {
        await queryInterface.bulkUpdate("appointments", values, { id }, { transaction });
    } else {
        await queryInterface.bulkInsert("appointments", [values], { transaction });
        const created = await selectRows(
            queryInterface,
            "SELECT id FROM appointments WHERE patient_id = :patientId AND reason LIKE :seedPattern LIMIT 1",
            { patientId, seedPattern },
            transaction,
        );
        id = created[0]?.id;
    }
    if (!id) throw new Error(`Could not create demo appointment: ${scenario.key}`);
    return id;
}

async function upsertHistory(queryInterface, appointmentId, history, transaction) {
    const rows = await selectRows(
        queryInterface,
        "SELECT id FROM appointment_history WHERE appointment_id = :appointmentId AND reason = :reason LIMIT 1",
        { appointmentId, reason: history.reason },
        transaction,
    );
    if (rows[0]) {
        await queryInterface.bulkUpdate(
            "appointment_history",
            { ...history, appointment_id: appointmentId },
            { id: rows[0].id },
            { transaction },
        );
    } else {
        await queryInterface.bulkInsert(
            "appointment_history",
            [{ ...history, appointment_id: appointmentId }],
            { transaction },
        );
    }
}

async function seedAppointmentHistory(
    queryInterface,
    scenario,
    appointmentId,
    ids,
    referenceDate,
    transaction,
) {
    const actorUserId = scenario.key === "no-show" ? null : ids.admin;
    const actorSnapshot =
        scenario.key === "no-show" ? "System appointment scheduler" : "Administrador Demo";
    const createdAt = scenario.createdAt;
    await upsertHistory(
        queryInterface,
        appointmentId,
        {
            actor_user_id: actorUserId,
            actor_snapshot: actorSnapshot,
            event_type: "Created",
            previous_values: null,
            new_values: {
                status: "Confirmed",
                start_at: scenario.previousStartAt || scenario.startAt,
                end_at: scenario.previousEndAt || scenario.endAt,
            },
            reason: `${DEMO_PREFIX} HISTORY:${scenario.key}:created`,
            occurred_at: createdAt,
        },
        transaction,
    );

    if (scenario.key === "rescheduled") {
        await upsertHistory(
            queryInterface,
            appointmentId,
            {
                actor_user_id: ids.admin,
                actor_snapshot: "Administrador Demo",
                event_type: "Rescheduled",
                previous_values: {
                    start_at: scenario.previousStartAt,
                    end_at: scenario.previousEndAt,
                },
                new_values: { start_at: scenario.startAt, end_at: scenario.endAt },
                reason: `${DEMO_PREFIX} HISTORY:${scenario.key}:rescheduled`,
                occurred_at: formatDemoDateTime(-4, 12, 0, referenceDate),
            },
            transaction,
        );
    }
    if (scenario.key === "cancelled") {
        await upsertHistory(
            queryInterface,
            appointmentId,
            {
                actor_user_id: ids.admin,
                actor_snapshot: "Administrador Demo",
                event_type: "Cancelled",
                previous_values: {
                    status: "Confirmed",
                    start_at: scenario.startAt,
                    end_at: scenario.endAt,
                },
                new_values: { status: "Cancelled" },
                reason: `${DEMO_PREFIX} HISTORY:${scenario.key}:cancelled`,
                occurred_at: formatDemoDateTime(-3, 12, 0, referenceDate),
            },
            transaction,
        );
    }
    if (scenario.key === "no-show") {
        await upsertHistory(
            queryInterface,
            appointmentId,
            {
                actor_user_id: null,
                actor_snapshot: "System appointment scheduler",
                event_type: "NoShowMarked",
                previous_values: { status: "Confirmed" },
                new_values: { status: "No Show" },
                reason: `${DEMO_PREFIX} HISTORY:${scenario.key}:marked`,
                occurred_at: formatDemoDateTime(-1, 12, 0, referenceDate),
            },
            transaction,
        );
    }
}

async function upsertClinicalRecord(
    queryInterface,
    record,
    appointmentId,
    doctorId,
    timestamp,
    transaction,
) {
    const startAt = record.startAt;
    const endAt = addDemoMinutes(startAt, 30);
    const consultations = await selectRows(
        queryInterface,
        "SELECT id FROM consultations WHERE appointment_id = :appointmentId LIMIT 1",
        { appointmentId },
        transaction,
    );
    const consultationValues = {
        appointment_id: appointmentId,
        doctor_id: doctorId,
        started_at: startAt,
        ended_at: endAt,
        duration_seconds: 1800,
        symptoms: record.symptoms,
        patient_feeling: "DEMO: información ficticia para mostrar la interfaz.",
        vital_signs: JSON.stringify(record.vitals),
        clinical_notes: record.notes,
        status: "Completed",
        interruption_reason: null,
        updated_at: timestamp,
    };
    let consultationId = consultations[0]?.id;
    if (consultationId) {
        await queryInterface.bulkUpdate(
            "consultations",
            consultationValues,
            { id: consultationId },
            { transaction },
        );
    } else {
        await queryInterface.bulkInsert(
            "consultations",
            [{ ...consultationValues, created_at: timestamp }],
            { transaction },
        );
        const created = await selectRows(
            queryInterface,
            "SELECT id FROM consultations WHERE appointment_id = :appointmentId LIMIT 1",
            { appointmentId },
            transaction,
        );
        consultationId = created[0]?.id;
    }
    if (!consultationId) throw new Error(`Could not save demo consultation: ${record.key}`);

    const diagnoses = await selectRows(
        queryInterface,
        "SELECT id FROM diagnoses WHERE consultation_id = :consultationId ORDER BY id LIMIT 1",
        { consultationId },
        transaction,
    );
    const diagnosisValues = {
        consultation_id: consultationId,
        diagnosis: record.diagnosis,
        notes: "DEMO: diagnóstico ficticio; no representa una evaluación médica.",
        updated_at: timestamp,
    };
    if (diagnoses[0]) {
        await queryInterface.bulkUpdate(
            "diagnoses",
            diagnosisValues,
            { id: diagnoses[0].id },
            { transaction },
        );
    } else {
        await queryInterface.bulkInsert(
            "diagnoses",
            [{ ...diagnosisValues, created_at: timestamp }],
            { transaction },
        );
    }

    const prescriptionMarker = `${DEMO_PREFIX} PRESCRIPTION:${record.key}`;
    const prescriptions = await selectRows(
        queryInterface,
        "SELECT id FROM prescriptions WHERE consultation_id = :consultationId ORDER BY id LIMIT 1",
        { consultationId },
        transaction,
    );
    const prescriptionValues = {
        consultation_id: consultationId,
        issued_at: startAt,
        notes: prescriptionMarker,
        updated_at: timestamp,
    };
    let prescriptionId = prescriptions[0]?.id;
    if (prescriptionId) {
        await queryInterface.bulkUpdate(
            "prescriptions",
            prescriptionValues,
            { id: prescriptionId },
            { transaction },
        );
    } else {
        await queryInterface.bulkInsert(
            "prescriptions",
            [{ ...prescriptionValues, created_at: timestamp }],
            { transaction },
        );
        const created = await selectRows(
            queryInterface,
            "SELECT id FROM prescriptions WHERE consultation_id = :consultationId LIMIT 1",
            { consultationId },
            transaction,
        );
        prescriptionId = created[0]?.id;
    }

    const items = await selectRows(
        queryInterface,
        "SELECT id FROM prescription_items WHERE prescription_id = :prescriptionId ORDER BY id LIMIT 1",
        { prescriptionId },
        transaction,
    );
    const itemValues = {
        prescription_id: prescriptionId,
        medication_name: `DEMO: producto ficticio ${record.key}`,
        dosage: "Solo demostración",
        frequency: "Sin indicación real",
        duration: "Dato ficticio",
        instructions: "Registro de prueba; no usar como tratamiento.",
        updated_at: timestamp,
    };
    if (items[0]) {
        await queryInterface.bulkUpdate(
            "prescription_items",
            itemValues,
            { id: items[0].id },
            { transaction },
        );
    } else {
        await queryInterface.bulkInsert(
            "prescription_items",
            [{ ...itemValues, created_at: timestamp }],
            { transaction },
        );
    }
}

async function upsertNotification(queryInterface, patientId, record, timestamp, transaction) {
    const rows = await selectRows(
        queryInterface,
        "SELECT id FROM notifications WHERE provider_message_id = :marker LIMIT 1",
        { marker: record.marker },
        transaction,
    );
    const values = {
        patient_id: patientId,
        appointment_id: record.appointmentId,
        channel: record.channel,
        recipient_address: record.recipient,
        event_type: record.eventType,
        payload: { demo: true, message: record.message },
        status: "Sent",
        scheduled_at: record.sentAt,
        sent_at: record.sentAt,
        read_at: record.readAt,
        attempt_count: 1,
        provider_message_id: record.marker,
        provider_delivery_status: "demo",
        last_error: null,
        updated_at: timestamp,
    };
    if (rows[0]) {
        await queryInterface.bulkUpdate(
            "notifications",
            values,
            { id: rows[0].id },
            { transaction },
        );
    } else {
        await queryInterface.bulkInsert("notifications", [{ ...values, created_at: timestamp }], {
            transaction,
        });
    }
}

async function ensureNotificationPreferences(queryInterface, patientId, timestamp, transaction) {
    for (const channel of ["Email", "SMS", "WhatsApp"]) {
        for (const eventType of [
            "appointment_reminder",
            "appointment_reschedule",
            "appointment_cancellation",
        ]) {
            const rows = await selectRows(
                queryInterface,
                `SELECT id FROM notification_preferences
                 WHERE patient_id = :patientId AND channel = :channel AND event_type = :eventType
                 LIMIT 1`,
                { patientId, channel, eventType },
                transaction,
            );
            if (rows[0]) {
                await queryInterface.bulkUpdate(
                    "notification_preferences",
                    { is_enabled: true, updated_at: timestamp },
                    { id: rows[0].id },
                    { transaction },
                );
            } else {
                await queryInterface.bulkInsert(
                    "notification_preferences",
                    [
                        {
                            patient_id: patientId,
                            channel,
                            event_type: eventType,
                            is_enabled: true,
                            created_at: timestamp,
                            updated_at: timestamp,
                        },
                    ],
                    { transaction },
                );
            }
        }
    }
}

async function upsertAuditLog(queryInterface, adminId, record, timestamp, transaction) {
    const reason = `${DEMO_PREFIX} AUDIT:${record.key}`;
    const rows = await selectRows(
        queryInterface,
        "SELECT id FROM audit_logs WHERE actor_user_id = :adminId AND reason = :reason LIMIT 1",
        { adminId, reason },
        transaction,
    );
    const values = {
        actor_user_id: adminId,
        actor_snapshot: "Administrador Demo",
        action: record.action,
        target_type: record.targetType,
        target_id: String(record.targetId),
        target_description: record.description,
        changes: record.changes,
        reason,
        result: "Success",
        occurred_at: record.occurredAt,
    };
    if (rows[0]) {
        await queryInterface.bulkUpdate("audit_logs", values, { id: rows[0].id }, { transaction });
    } else {
        await queryInterface.bulkInsert("audit_logs", [values], { transaction });
    }
}

async function seedDemoData(queryInterface, transaction, referenceDate) {
    const timestamp = referenceDate;
    const roleIds = await ensureRoleIds(queryInterface, transaction);
    const statusIds = await ensureStatusIds(queryInterface, transaction);
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    const userIds = {};
    for (const account of DEMO_ACCOUNTS) {
        userIds[account.email] = await ensureAccount(
            queryInterface,
            account,
            roleIds,
            passwordHash,
            timestamp,
            transaction,
        );
    }

    const doctorIds = {};
    for (const account of DEMO_ACCOUNTS.filter((item) => item.role === "Doctor")) {
        const specialtyId = await ensureSpecialty(queryInterface, account, timestamp, transaction);
        if (!specialtyId) throw new Error(`Could not resolve demo specialty: ${account.specialty}`);
        const doctorId = await ensureDoctor(
            queryInterface,
            account,
            userIds[account.email],
            specialtyId,
            timestamp,
            transaction,
        );
        doctorIds[account.email] = { id: doctorId, specialtyId };
    }

    const patientAccount = DEMO_ACCOUNTS.find((account) => account.role === "Patient");
    const patientId = await ensurePatient(
        queryInterface,
        userIds[patientAccount.email],
        timestamp,
        transaction,
    );
    const nowBogota = formatDemoDateTime(0, 12, 0, referenceDate).slice(0, 10);
    for (const doctor of Object.values(doctorIds)) {
        await ensureAvailability(queryInterface, doctor.id, nowBogota, timestamp, transaction);
    }

    const scenarios = getDemoAppointmentScenarios(referenceDate);
    const appointmentIds = {};
    for (const scenario of scenarios) {
        const doctor = doctorIds[scenario.doctor];
        appointmentIds[scenario.key] = await upsertAppointment(
            queryInterface,
            scenario,
            patientId,
            doctor,
            statusIds[scenario.status],
            timestamp,
            transaction,
        );
        await seedAppointmentHistory(
            queryInterface,
            scenario,
            appointmentIds[scenario.key],
            { admin: userIds["admin.test@saludvital.local"] },
            referenceDate,
            transaction,
        );
    }

    for (const clinicalRecord of getDemoClinicalRecords()) {
        const scenario = scenarios.find((item) => item.key === clinicalRecord.key);
        await upsertClinicalRecord(
            queryInterface,
            { ...clinicalRecord, startAt: scenario.startAt },
            appointmentIds[clinicalRecord.key],
            doctorIds[scenario.doctor].id,
            timestamp,
            transaction,
        );
    }

    await ensureNotificationPreferences(queryInterface, patientId, timestamp, transaction);
    const notifications = [
        {
            marker: "DEMO-SEED-notification-confirmation",
            eventType: "appointment_confirmation",
            channel: "Email",
            recipient: patientAccount.email,
            appointmentId: appointmentIds.confirmed,
            sentAt: formatDemoDateTime(-4, 12, 0, referenceDate),
            readAt: formatDemoDateTime(-3, 12, 0, referenceDate),
            message: "DEMO: confirmación ficticia de una cita.",
        },
        {
            marker: "DEMO-SEED-notification-reminder",
            eventType: "appointment_reminder",
            channel: "SMS",
            recipient: "3000000001",
            appointmentId: appointmentIds.confirmed,
            sentAt: formatDemoDateTime(-1, 12, 0, referenceDate),
            readAt: null,
            message: "DEMO: recordatorio ficticio; no se envió un SMS.",
        },
        {
            marker: "DEMO-SEED-notification-reschedule",
            eventType: "appointment_reschedule",
            channel: "WhatsApp",
            recipient: "573000000001",
            appointmentId: appointmentIds.rescheduled,
            sentAt: formatDemoDateTime(-3, 12, 0, referenceDate),
            readAt: formatDemoDateTime(-2, 12, 0, referenceDate),
            message: "DEMO: aviso ficticio de reprogramación; no se envió un WhatsApp.",
        },
        {
            marker: "DEMO-SEED-notification-cancellation",
            eventType: "appointment_cancellation",
            channel: "Email",
            recipient: patientAccount.email,
            appointmentId: appointmentIds.cancelled,
            sentAt: formatDemoDateTime(-2, 12, 0, referenceDate),
            readAt: null,
            message: "DEMO: aviso ficticio de cancelación de cita.",
        },
    ];
    for (const notification of notifications) {
        await upsertNotification(queryInterface, patientId, notification, timestamp, transaction);
    }

    const auditRecords = [
        {
            key: "appointment-created",
            action: "AdminAppointmentCreated",
            targetType: "Appointment",
            targetId: appointmentIds.confirmed,
            description: "DEMO: cita confirmada de Paciente Demo",
            occurredAt: formatDemoDateTime(-5, 12, 0, referenceDate),
            changes: { next: { status: "Confirmed" } },
        },
        {
            key: "appointment-cancelled",
            action: "AdminAppointmentCancelled",
            targetType: "Appointment",
            targetId: appointmentIds.cancelled,
            description: "DEMO: cita cancelada de Paciente Demo",
            occurredAt: formatDemoDateTime(-3, 12, 0, referenceDate),
            changes: { previous: { status: "Confirmed" }, next: { status: "Cancelled" } },
        },
        {
            key: "appointment-rescheduled",
            action: "AdminAppointmentRescheduled",
            targetType: "Appointment",
            targetId: appointmentIds.rescheduled,
            description: "DEMO: cita reprogramada de Paciente Demo",
            occurredAt: formatDemoDateTime(-4, 12, 0, referenceDate),
            changes: {
                previous: {
                    startAt: scenarios.find((item) => item.key === "rescheduled").previousStartAt,
                },
                next: { startAt: scenarios.find((item) => item.key === "rescheduled").startAt },
            },
        },
        {
            key: "doctor-schedule-updated",
            action: "AdminDoctorScheduleUpdated",
            targetType: "Doctor",
            targetId: doctorIds["doctor.test@saludvital.local"].id,
            description: "DEMO: horario de Dr. Carlos Ramírez",
            occurredAt: formatDemoDateTime(-6, 12, 0, referenceDate),
            changes: { next: { startTime: "07:00:00", endTime: "19:00:00" } },
        },
    ];
    for (const record of auditRecords) {
        await upsertAuditLog(
            queryInterface,
            userIds["admin.test@saludvital.local"],
            record,
            timestamp,
            transaction,
        );
    }
}

export async function up(queryInterface) {
    if (process.env.NODE_ENV === "production") {
        throw new Error("Development demo data cannot be seeded in production.");
    }

    const transaction = await queryInterface.sequelize.transaction();
    try {
        await seedDemoData(queryInterface, transaction, new Date());
        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}

// Keep demonstration fixtures in place when reverting the seeder.
export async function down() {
    // Intentionally preserve development-only records and their references.
}
