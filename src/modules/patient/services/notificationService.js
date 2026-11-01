import database from "../../../../config/database.js";
import { Op } from "sequelize";
import { Notification, NotificationPreference, Patient } from "../../../models/associations.js";

export const notificationChannels = ["WhatsApp", "SMS", "Email"];

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

const DEFAULT_ENABLED_CHANNEL = "SMS";

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
        date: notification.sent_at || notification.scheduled_at,
        readAt: notification.read_at,
        details: historyDetails[eventKey] || "Tienes una actualización de SaludVital.",
    };
}

function getEnabledChannelStates(storedPreferences) {
    const storedValuesByChannel = new Map();
    storedPreferences.forEach((preference) => {
        const channelValues = storedValuesByChannel.get(preference.channel) || [];
        channelValues.push(preference.is_enabled);
        storedValuesByChannel.set(preference.channel, channelValues);
    });

    const states = Object.fromEntries(
        notificationChannels.map((channel) => {
            const storedValues = storedValuesByChannel.get(channel) || [];
            const isEnabled = storedValues.length
                ? storedValues.some(Boolean)
                : channel === DEFAULT_ENABLED_CHANNEL;
            return [channel, isEnabled];
        }),
    );

    if (!Object.values(states).some(Boolean)) states[DEFAULT_ENABLED_CHANNEL] = true;
    return states;
}

export async function getPatientNotificationSettings(userId, { markVisibleAsRead = false } = {}) {
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

    const [storedPreferences, notifications] = await Promise.all([
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
            limit: 20,
        }),
    ]);

    if (markVisibleAsRead) {
        const visibleIds = notifications
            .slice(0, 2)
            .filter((notification) => !notification.read_at)
            .map((notification) => notification.id);
        if (visibleIds.length) {
            const readAt = new Date();
            await Notification.update(
                { read_at: readAt },
                { where: { patient_id: patient.id, id: { [Op.in]: visibleIds }, read_at: null } },
            );
            notifications.forEach((notification) => {
                if (visibleIds.includes(notification.id)) notification.read_at = readAt;
            });
        }
    }

    const channelStates = getEnabledChannelStates(storedPreferences);
    let preferences = notificationChannels.flatMap((channel) => {
        const isEnabled = channelStates[channel];

        return notificationEvents.map((event) => ({
            channel,
            eventType: event.key,
            isEnabled,
        }));
    });

    // Keep SMS enabled when legacy data has every channel disabled.
    if (!preferences.some((preference) => preference.isEnabled)) {
        preferences = preferences.map((preference) => ({
            ...preference,
            isEnabled: preference.channel === DEFAULT_ENABLED_CHANNEL,
        }));
    }

    return {
        patient: patient.get({ plain: true }),
        notificationContacts: {
            smsPhone: patient.notification_phone || patient.phone,
            whatsappPhone:
                patient.notification_whatsapp_phone || patient.notification_phone || patient.phone,
            email: patient.notification_email || patient.user.email,
        },
        preferences,
        history: notifications.map(toHistoryItem),
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
    return Notification.count({ where: { patient_id: patient.id, read_at: null } });
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

export async function markPatientNotificationsAsRead(userId, notificationIds) {
    if (
        !Array.isArray(notificationIds) ||
        notificationIds.length === 0 ||
        notificationIds.length > 20 ||
        notificationIds.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
        new Set(notificationIds).size !== notificationIds.length
    ) {
        const error = new Error("La selección de notificaciones no es válida.");
        error.status = 400;
        throw error;
    }

    const patient = await Patient.findOne({ where: { user_id: userId }, attributes: ["id"] });
    if (!patient) {
        const error = new Error("No se encontró el perfil del paciente.");
        error.status = 404;
        throw error;
    }

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
    return {
        unreadCount: await Notification.count({ where: { patient_id: patient.id, read_at: null } }),
    };
}
