import { Op } from "sequelize";
import database from "../../../../config/database.js";
import {
    Notification,
    NotificationPreference,
    Patient,
    WhatsAppVerification,
} from "../../../models/associations.js";

export const notificationChannels = ["WhatsApp", "SMS", "Email"];

export const notificationEvents = [
    {
        key: "appointment_confirmation",
        label: "Confirmación de citas",
        description: "Recibe un mensaje cuando tu cita sea confirmada.",
        enabledByDefault: true,
    },
    {
        key: "appointment_reminder",
        label: "Recordatorios de citas",
        description: "Recibe un recordatorio 24 horas antes de tu cita.",
        enabledByDefault: true,
    },
    {
        key: "appointment_reschedule",
        label: "Cambios o reprogramaciones",
        description: "Te notificaremos si tu cita se reprograma.",
        enabledByDefault: true,
    },
    {
        key: "appointment_cancellation",
        label: "Cancelaciones",
        description: "Recibe un mensaje si tu cita es cancelada.",
        enabledByDefault: true,
    },
    {
        key: "promotion",
        label: "Novedades y promociones",
        description: "Recibe información sobre novedades y nuevos servicios.",
        enabledByDefault: false,
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
    const event = notificationEvents.find((item) => item.key === eventKey);

    return {
        id: notification.id,
        eventKey,
        eventLabel: event?.label || String(notification.event_type).replaceAll("_", " "),
        channel: channelLabels[notification.channel] || notification.channel,
        channelKey: notification.channel,
        status: notification.status,
        date: notification.sent_at || notification.scheduled_at,
        details: historyDetails[eventKey] || "Tienes una actualización de SaludVital.",
    };
}

export async function getPatientNotificationSettings(userId) {
    const patient = await Patient.findOne({
        where: { user_id: userId },
        attributes: ["id", "first_name", "last_name", "phone"],
        include: [{ association: "user", attributes: ["email"] }],
    });

    if (!patient) {
        return {
            patient: null,
            preferences: [],
            history: [],
            whatsappVerified: false,
        };
    }

    const [storedPreferences, notifications, verifiedWhatsApp] = await Promise.all([
        NotificationPreference.findAll({ where: { patient_id: patient.id } }),
        Notification.findAll({
            where: { patient_id: patient.id },
            order: [["scheduled_at", "DESC"]],
            limit: 20,
        }),
        WhatsAppVerification.findOne({
            where: { patient_id: patient.id, verified_at: { [Op.ne]: null }, invalidated_at: null },
            order: [["verified_at", "DESC"]],
        }),
    ]);

    const preferenceLookup = new Map(
        storedPreferences.map((item) => [`${item.channel}:${item.event_type}`, item.is_enabled]),
    );
    const preferences = notificationChannels.flatMap((channel) =>
        notificationEvents.map((event) => ({
            channel,
            eventType: event.key,
            isEnabled: preferenceLookup.get(`${channel}:${event.key}`) ?? event.enabledByDefault,
        })),
    );

    return {
        patient: patient.get({ plain: true }),
        preferences,
        history: notifications.map(toHistoryItem),
        whatsappVerified: Boolean(verifiedWhatsApp),
    };
}

export async function updatePatientNotificationPreferences(userId, updates) {
    if (!Array.isArray(updates) || updates.length === 0 || updates.length > 15) {
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
    }

    await database.transaction(async (transaction) => {
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

    return updates;
}
