import database from "../../../../config/database.js";
import { Op } from "sequelize";
import {
    AppointmentHistory,
    Doctor,
    Notification,
    NotificationPreference,
    Patient,
    PatientAppointmentHistoryRead,
    Specialities,
} from "../../../models/associations.js";
import { getEnabledChannelStates, notificationChannels } from "./notificationChannelRules.js";
export { notificationChannels };

// Appointment event switches are fixed; patients choose only the delivery channels.
export const notificationEvents = [
    {
        key: "appointment_reminder",
        label: "Recordatorios de citas",
        description: "Recibe un recordatorio 24 horas antes de tu cita.",
    },
    {
        key: "appointment_reschedule",
        label: "Cambios o reprogramaciones",
        description: "Te notificaremos si tu cita se reprograma.",
    },
    {
        key: "appointment_cancellation",
        label: "Cancelaciones",
        description: "Recibe un mensaje si tu cita es cancelada.",
    },
];

const channelLabels = {
    WhatsApp: "WhatsApp",
    SMS: "SMS",
    Email: "Correo electrónico",
};

const historyDetails = {
    appointment_confirmation: "Tu cita fue confirmada.",
    appointment_reminder: "Recuerda tu próxima cita médica.",
    appointment_reschedule: "Tu cita fue reprogramada.",
    appointment_cancellation: "Tu cita fue cancelada.",
    promotion: "Tenemos novedades de servicios de salud para ti.",
};

const historyEventLabels = {
    appointment_confirmation: "Confirmación de citas",
    appointment_reminder: "Recordatorios de citas",
    appointment_reschedule: "Cambios o reprogramaciones",
    appointment_cancellation: "Cancelaciones",
    promotion: "Novedades y promociones",
};

const appointmentActivityLabels = {
    Created: "Cita creada y confirmada",
    Rescheduled: "Cita reprogramada",
    Cancelled: "Cita cancelada",
};

function validateNotificationContacts(contacts = {}) {
    const smsPhone =
        typeof contacts.smsPhone === "string"
            ? contacts.smsPhone.trim().replaceAll(/[\s()-]/g, "")
            : "";
    const whatsappPhone =
        typeof contacts.whatsappPhone === "string"
            ? contacts.whatsappPhone.trim().replaceAll(/[\s()-]/g, "")
            : "";
    const email = typeof contacts.email === "string" ? contacts.email.trim().toLowerCase() : "";

    if (!/^\+?\d{7,15}$/.test(smsPhone)) {
        const error = new Error("Ingresa un número válido para recibir SMS.");
        error.status = 400;
        throw error;
    }
    if (!/^\+?\d{7,15}$/.test(whatsappPhone)) {
        const error = new Error("Ingresa un número válido para recibir WhatsApp.");
        error.status = 400;
        throw error;
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        const error = new Error("Ingresa un correo válido para recibir notificaciones.");
        error.status = 400;
        throw error;
    }

    return { smsPhone, whatsappPhone, email };
}

function normalizeEventType(eventType) {
    const normalized = String(eventType || "")
        .toLowerCase()
        .replaceAll(/[^a-z]/g, "");

    if (normalized.includes("confirm")) return "appointment_confirmation";
    if (normalized.includes("remind")) return "appointment_reminder";
    if (normalized.includes("reschedul") || normalized.includes("reprogram")) {
        return "appointment_reschedule";
    }
    if (normalized.includes("cancel")) return "appointment_cancellation";
    if (normalized.includes("promot")) return "promotion";
    return null;
}

function toHistoryItem(notification) {
    const eventKey = normalizeEventType(notification.event_type);
    return {
        id: notification.id,
        eventKey,
        eventLabel:
            historyEventLabels[eventKey] || String(notification.event_type).replaceAll("_", " "),
        channel: channelLabels[notification.channel] || notification.channel,
        channelKey: notification.channel,
        status: notification.status,
        statusLabel: getDeliveryStatusLabel(notification.status),
        date: notification.sent_at || notification.scheduled_at,
        readAt: notification.read_at,
        details: historyDetails[eventKey] || "Tienes una actualización de SaludVital.",
    };
}

function getDeliveryStatusLabel(status) {
    const labels = {
        Pending: "Pendiente",
        Processing: "En proceso",
        Sent: "Aceptado por el proveedor",
        Failed: "Fallido",
        Cancelled: "Cancelado",
        OutcomeUnknown: "En verificación",
    };
    return labels[status] || "Estado no disponible";
}

function getAppointmentStartAt(historyRecord) {
    const recordedValues =
        historyRecord.event_type === "Cancelled"
            ? historyRecord.previous_values
            : historyRecord.new_values;
    return (
        recordedValues?.start_at ||
        recordedValues?.startAt ||
        historyRecord.appointment?.start_at ||
        null
    );
}

function formatAppointmentSchedule(startAt) {
    if (!startAt) return null;
    const date = new Date(startAt);
    if (Number.isNaN(date.getTime())) return null;
    const dateLabel = new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeZone: "America/Bogota",
    }).format(date);
    const timeLabel = new Intl.DateTimeFormat("es-CO", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Bogota",
    }).format(date);
    return `${dateLabel} a las ${timeLabel}`;
}

function toAppointmentActivityItem(historyRecord) {
    const schedule = formatAppointmentSchedule(getAppointmentStartAt(historyRecord));
    const details = {
        Created: schedule
            ? `Tu cita quedó confirmada para ${schedule}.`
            : "Tu cita quedó creada y confirmada.",
        Rescheduled: schedule
            ? `Tu cita fue reprogramada para ${schedule}.`
            : "Tu cita fue reprogramada.",
        Cancelled: schedule
            ? `Tu cita programada para ${schedule} fue cancelada.`
            : "Tu cita fue cancelada.",
    };
    const occurredAt = new Date(historyRecord.occurred_at);

    return {
        id: `appointment-${historyRecord.id}`,
        appointmentHistoryId: historyRecord.id,
        isInAppActivity: true,
        eventLabel: appointmentActivityLabels[historyRecord.event_type],
        channel: "En SaludVital",
        channelKey: "System",
        statusLabel: "Registrada",
        date: occurredAt,
        readAt: historyRecord.patientReadReceipts?.[0]?.read_at || null,
        details: details[historyRecord.event_type],
    };
}

async function getPatientAppointmentActivity(patientId) {
    const history = await AppointmentHistory.findAll({
        where: { event_type: { [Op.in]: Object.keys(appointmentActivityLabels) } },
        attributes: ["id", "event_type", "previous_values", "new_values", "occurred_at"],
        include: [
            {
                association: "patientReadReceipts",
                attributes: ["read_at"],
                where: { patient_id: patientId },
                required: false,
            },
            {
                association: "appointment",
                attributes: ["id", "start_at"],
                where: { patient_id: patientId },
                required: true,
            },
        ],
        order: [
            ["occurred_at", "DESC"],
            ["id", "DESC"],
        ],
    });

    return history.map(toAppointmentActivityItem);
}

async function countUnreadAppointmentActivity(patientId) {
    return AppointmentHistory.count({
        where: {
            event_type: { [Op.in]: Object.keys(appointmentActivityLabels) },
            "$patientReadReceipts.id$": null,
        },
        include: [
            {
                association: "appointment",
                attributes: [],
                where: { patient_id: patientId },
                required: true,
            },
            {
                association: "patientReadReceipts",
                attributes: [],
                where: { patient_id: patientId },
                required: false,
            },
        ],
        distinct: true,
        col: "id",
    });
}

async function getUnreadCountByPatientId(patientId) {
    const [deliveryCount, appointmentActivityCount] = await Promise.all([
        Notification.count({ where: { patient_id: patientId, read_at: null } }),
        countUnreadAppointmentActivity(patientId),
    ]);
    return deliveryCount + appointmentActivityCount;
}

export async function getPatientNotificationSettings(userId) {
    const patient = await Patient.findOne({
        where: { user_id: userId },
        attributes: [
            "id",
            "first_name",
            "last_name",
            "phone",
            "notification_phone",
            "notification_whatsapp_phone",
            "notification_email",
        ],
        include: [{ association: "user", attributes: ["email"] }],
    });

    if (!patient) {
        return {
            patient: null,
            notificationContacts: { phone: "", email: "" },
            preferences: [],
            history: [],
        };
    }

    const [storedPreferences, notifications, appointmentActivity] = await Promise.all([
        NotificationPreference.findAll({ where: { patient_id: patient.id } }),
        Notification.findAll({
            where: { patient_id: patient.id },
            attributes: [
                "id",
                "event_type",
                "channel",
                "status",
                "scheduled_at",
                "sent_at",
                "read_at",
            ],
            order: [["scheduled_at", "DESC"]],
        }),
        getPatientAppointmentActivity(patient.id),
    ]);

    const history = [...notifications.map(toHistoryItem), ...appointmentActivity].sort(
        (first, second) => new Date(second.date) - new Date(first.date),
    );

    const channelStates = getEnabledChannelStates(storedPreferences);
    const preferences = notificationChannels.flatMap((channel) => {
        const isEnabled = channelStates[channel];

        return notificationEvents.map((event) => ({
            channel,
            eventType: event.key,
            isEnabled,
        }));
    });

    return {
        patient: patient.get({ plain: true }),
        notificationContacts: {
            smsPhone: patient.notification_phone || patient.phone,
            whatsappPhone:
                patient.notification_whatsapp_phone || patient.notification_phone || patient.phone,
            email: patient.notification_email || patient.user.email,
        },
        preferences,
        history,
    };
}

export async function updatePatientNotificationPreferences(userId, updates, contacts) {
    const notificationContacts = validateNotificationContacts(contacts);
    const expectedPreferenceCount = notificationChannels.length * notificationEvents.length;
    if (!Array.isArray(updates) || updates.length !== expectedPreferenceCount) {
        const error = new Error("La configuración de notificaciones no es válida.");
        error.status = 400;
        throw error;
    }

    const patient = await Patient.findOne({ where: { user_id: userId }, attributes: ["id"] });
    if (!patient) {
        const error = new Error("No se encontró el perfil del paciente.");
        error.status = 404;
        throw error;
    }

    const seen = new Set();
    const channelStates = new Map();
    for (const update of updates) {
        const key = `${update?.channel}:${update?.eventType}`;
        if (
            !notificationChannels.includes(update?.channel) ||
            !notificationEvents.some((event) => event.key === update?.eventType) ||
            typeof update?.isEnabled !== "boolean" ||
            seen.has(key)
        ) {
            const error = new Error("La configuración de notificaciones no es válida.");
            error.status = 400;
            throw error;
        }
        seen.add(key);

        const channelState = channelStates.get(update.channel);
        if (channelState !== undefined && channelState !== update.isEnabled) {
            const error = new Error(
                "Selecciona los canales de notificación de forma independiente.",
            );
            error.status = 400;
            throw error;
        }
        channelStates.set(update.channel, update.isEnabled);
    }

    if (seen.size !== expectedPreferenceCount) {
        const error = new Error("La configuración de notificaciones está incompleta.");
        error.status = 400;
        throw error;
    }

    if (![...channelStates.values()].some(Boolean)) {
        const error = new Error(
            "Mantén al menos un canal activo para recibir avisos sobre tus citas.",
        );
        error.status = 400;
        throw error;
    }

    await database.transaction(async (transaction) => {
        // Keep notification destinations separate from profile and login contact details.
        await patient.update(
            {
                notification_phone: notificationContacts.smsPhone,
                notification_whatsapp_phone: notificationContacts.whatsappPhone,
                notification_email: notificationContacts.email,
            },
            { transaction },
        );

        for (const update of updates) {
            await NotificationPreference.upsert(
                {
                    patient_id: patient.id,
                    channel: update.channel,
                    event_type: update.eventType,
                    is_enabled: update.isEnabled,
                },
                { transaction },
            );
        }
    });

    return { preferences: updates, notificationContacts };
}

export async function getPatientUnreadNotificationCount(userId) {
    const patient = await Patient.findOne({ where: { user_id: userId }, attributes: ["id"] });
    if (!patient) return 0;
    return getUnreadCountByPatientId(patient.id);
}

export async function getPatientChannelStates(patientId) {
    const storedPreferences = await NotificationPreference.findAll({
        where: { patient_id: patientId },
        attributes: ["channel", "is_enabled"],
    });
    return getEnabledChannelStates(storedPreferences);
}

export async function updatePatientNotificationChannel(userId, channel, isEnabled) {
    if (!notificationChannels.includes(channel) || typeof isEnabled !== "boolean") {
        const error = new Error("La configuración del canal no es válida.");
        error.status = 400;
        throw error;
    }

    const patient = await Patient.findOne({ where: { user_id: userId }, attributes: ["id"] });
    if (!patient) {
        const error = new Error("No se encontró el perfil del paciente.");
        error.status = 404;
        throw error;
    }

    const storedPreferences = await NotificationPreference.findAll({
        where: { patient_id: patient.id },
        attributes: ["channel", "event_type", "is_enabled"],
    });
    const channelStates = getEnabledChannelStates(storedPreferences);
    channelStates[channel] = isEnabled;

    if (!Object.values(channelStates).some(Boolean)) {
        const error = new Error(
            "Mantén al menos un canal activo para recibir avisos sobre tus citas.",
        );
        error.status = 400;
        throw error;
    }

    const preferences = notificationChannels.flatMap((preferenceChannel) =>
        notificationEvents.map((event) => ({
            patient_id: patient.id,
            channel: preferenceChannel,
            event_type: event.key,
            is_enabled: channelStates[preferenceChannel],
        })),
    );

    await database.transaction(async (transaction) => {
        for (const preference of preferences) {
            await NotificationPreference.upsert(preference, { transaction });
        }
    });

    return { channelStates };
}

export async function markPatientNotificationEntriesAsRead(
    userId,
    notificationIds = [],
    appointmentHistoryIds = [],
) {
    const isValidSelection = (ids) =>
        Array.isArray(ids) &&
        ids.length <= 20 &&
        ids.every((id) => Number.isSafeInteger(id) && id > 0) &&
        new Set(ids).size === ids.length;
    if (
        !isValidSelection(notificationIds) ||
        !isValidSelection(appointmentHistoryIds) ||
        (notificationIds.length === 0 && appointmentHistoryIds.length === 0)
    ) {
        const error = new Error("La selecciÃ³n de notificaciones no es vÃ¡lida.");
        error.status = 400;
        throw error;
    }

    const patient = await Patient.findOne({ where: { user_id: userId }, attributes: ["id"] });
    if (!patient) {
        const error = new Error("No se encontrÃ³ el perfil del paciente.");
        error.status = 404;
        throw error;
    }

    if (notificationIds.length) {
        await Notification.update(
            { read_at: new Date() },
            {
                where: {
                    patient_id: patient.id,
                    id: { [Op.in]: notificationIds },
                    read_at: null,
                },
            },
        );
    }

    if (appointmentHistoryIds.length) {
        const ownedEvents = await AppointmentHistory.findAll({
            where: {
                id: { [Op.in]: appointmentHistoryIds },
                event_type: { [Op.in]: Object.keys(appointmentActivityLabels) },
            },
            attributes: ["id"],
            include: [
                {
                    association: "appointment",
                    attributes: [],
                    where: { patient_id: patient.id },
                    required: true,
                },
            ],
        });
        const readAt = new Date();
        const receipts = ownedEvents.map((event) => ({
            patient_id: patient.id,
            appointment_history_id: event.id,
            read_at: readAt,
        }));
        if (receipts.length) {
            await PatientAppointmentHistoryRead.bulkCreate(receipts, { ignoreDuplicates: true });
        }
    }

    return { unreadCount: await getUnreadCountByPatientId(patient.id) };
}

export async function markAllPatientNotificationEntriesAsRead(userId) {
    const patient = await Patient.findOne({ where: { user_id: userId }, attributes: ["id"] });
    if (!patient) {
        const error = new Error("No se encontrÃ³ el perfil del paciente.");
        error.status = 404;
        throw error;
    }

    const readAt = new Date();
    await database.transaction(async (transaction) => {
        await Notification.update(
            { read_at: readAt },
            { where: { patient_id: patient.id, read_at: null }, transaction },
        );
        await database.query(
            `INSERT IGNORE INTO patient_appointment_history_reads
                (patient_id, appointment_history_id, read_at)
             SELECT :patientId, history.id, :readAt
             FROM appointment_history AS history
             INNER JOIN appointments AS appointment
                ON appointment.id = history.appointment_id
                AND appointment.patient_id = :patientId
             LEFT JOIN patient_appointment_history_reads AS receipt
                ON receipt.patient_id = :patientId
                AND receipt.appointment_history_id = history.id
             WHERE history.event_type IN (:eventTypes)
                AND receipt.id IS NULL`,
            {
                replacements: {
                    patientId: patient.id,
                    readAt,
                    eventTypes: Object.keys(appointmentActivityLabels),
                },
                transaction,
            },
        );
    });

    return { unreadCount: await getUnreadCountByPatientId(patient.id) };
}

function parseAppointmentHistoryId(value) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) {
        const error = new Error("No encontramos esa actividad de cita.");
        error.status = 404;
        throw error;
    }
    return id;
}

function safeDoctorPhotoUrl(value) {
    if (typeof value !== "string") return null;
    try {
        const imageUrl = new URL(value, "https://saludvital.invalid");
        if (imageUrl.origin !== "https://saludvital.invalid") return null;
        return `${imageUrl.pathname}${imageUrl.search}${imageUrl.hash}`;
    } catch {
        return null;
    }
}

export async function getPatientAppointmentActivityDetails(userId, rawHistoryId) {
    const historyId = parseAppointmentHistoryId(rawHistoryId);
    const patient = await Patient.findOne({ where: { user_id: userId }, attributes: ["id"] });
    if (!patient) {
        const error = new Error("No encontramos esa actividad de cita.");
        error.status = 404;
        throw error;
    }

    const historyRecord = await AppointmentHistory.findOne({
        where: {
            id: historyId,
            event_type: { [Op.in]: Object.keys(appointmentActivityLabels) },
        },
        attributes: ["id", "event_type", "previous_values", "new_values", "occurred_at"],
        include: [
            {
                association: "appointment",
                attributes: ["id", "start_at", "doctor_id", "specialty_id"],
                where: { patient_id: patient.id },
                required: true,
            },
        ],
    });
    if (!historyRecord) {
        const error = new Error("No encontramos esa actividad de cita.");
        error.status = 404;
        throw error;
    }

    const eventValues =
        historyRecord.event_type === "Cancelled"
            ? historyRecord.previous_values || {}
            : historyRecord.new_values || {};
    const doctorId = eventValues.doctor_id || historyRecord.appointment.doctor_id;
    const specialtyId = eventValues.specialty_id || historyRecord.appointment.specialty_id;
    const [doctor, specialty] = await Promise.all([
        Doctor.findByPk(doctorId, { attributes: ["id", "display_name", "profile_photo_url"] }),
        Specialities.findByPk(specialtyId, { attributes: ["id", "name"] }),
    ]);

    const appointmentStartAt = getAppointmentStartAt(historyRecord);
    const appointmentDate = appointmentStartAt ? new Date(appointmentStartAt) : null;

    return {
        eventLabel: appointmentActivityLabels[historyRecord.event_type],
        occurredAt: new Date(historyRecord.occurred_at),
        appointmentStartAt:
            appointmentDate && !Number.isNaN(appointmentDate.getTime())
                ? appointmentDate.toISOString()
                : null,
        appointmentStatus: historyRecord.event_type === "Cancelled" ? "Cancelada" : "Confirmada",
        specialty: specialty?.name || "Especialidad no disponible",
        doctor: {
            name: doctor?.display_name || "MÃ©dico no disponible",
            photoUrl: safeDoctorPhotoUrl(doctor?.profile_photo_url),
        },
    };
}
