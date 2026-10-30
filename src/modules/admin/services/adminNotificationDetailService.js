import {
    Appointment,
    AppointmentStatus,
    Notification,
    Patient,
} from "../../../models/associations.js";
import { getSafeDeliveryError } from "./notificationDeliveryDisplayService.js";

const MAX_NOTIFICATION_ID = 4_294_967_295;

const CHANNEL_LABELS = {
    Email: "Correo electrónico",
    SMS: "SMS",
    WhatsApp: "WhatsApp",
};

const EVENT_LABELS = {
    appointment_confirmation: "Confirmación de cita",
    appointment_reminder: "Recordatorio de cita",
    appointment_reschedule: "Reprogramación de cita",
    appointment_cancellation: "Cancelación de cita",
};

const APPLICATION_STATUS_LABELS = {
    Pending: "Pendiente",
    Processing: "En proceso",
    Sent: "Aceptada por el proveedor",
    Failed: "Fallida en el envío",
    Cancelled: "Cancelada",
};

const PROVIDER_STATUS_LABELS = {
    sent: "Aceptado por Meta",
    delivered: "Entregado por Meta",
    read: "Leído por Meta",
    failed: "Fallido según Meta",
};

const APPOINTMENT_STATUS_LABELS = {
    Pending: "Pendiente",
    Confirmed: "Confirmada",
    "In Progress": "En curso",
    Attended: "Atendida",
    Cancelled: "Cancelada",
};

function createServiceError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parseNotificationId(value) {
    if (typeof value !== "string" || !/^\d{1,10}$/.test(value)) {
        throw createServiceError("El identificador de la notificación no es válido.", 400);
    }

    const notificationId = Number(value);
    if (
        !Number.isSafeInteger(notificationId) ||
        notificationId < 1 ||
        notificationId > MAX_NOTIFICATION_ID
    ) {
        throw createServiceError("El identificador de la notificación no es válido.", 400);
    }
    return notificationId;
}

function maskRecipient(value) {
    if (typeof value !== "string" || !value.trim()) return "Destino no disponible";
    const recipient = value.trim();
    if (recipient.includes("@")) {
        const [localPart, domain] = recipient.split("@", 2);
        return domain ? `${localPart.slice(0, 1)}•••@${domain}` : "Destino oculto";
    }

    const digits = recipient.replaceAll(/\D/g, "");
    return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "Destino oculto";
}

function maskProviderReference(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    const reference = value.trim();
    return reference.length > 8 ? `••••${reference.slice(-4)}` : "Referencia registrada";
}

function toIsoTimestamp(value) {
    if (!value) return null;
    const timestamp = new Date(value);
    return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function getPatientName(patient) {
    return (
        [patient?.first_name, patient?.last_name].filter(Boolean).join(" ") ||
        "Contacto sin nombre registrado"
    );
}

function getSafeFailure(error) {
    const safeError = getSafeDeliveryError(error);
    if (!safeError) return null;
    return {
        description: safeError.description,
        providerCode: safeError.code,
    };
}

function buildDeliveryEvents(record) {
    const events = [];
    const createdAt = toIsoTimestamp(record.created_at);
    const sentAt = toIsoTimestamp(record.sent_at);
    const updatedAt = toIsoTimestamp(record.updated_at);

    if (createdAt) {
        events.push({
            type: "created",
            label: "Notificación registrada",
            occurredAt: createdAt,
            description: EVENT_LABELS[record.event_type] || "Evento del sistema",
        });
    }

    if (sentAt) {
        events.push({
            type: "accepted",
            label: "Aceptada por el proveedor",
            occurredAt: sentAt,
            description: "El proveedor aceptó la solicitud de envío.",
        });
    }

    const providerStatus = record.provider_delivery_status;
    if (providerStatus && updatedAt && ["delivered", "read", "failed"].includes(providerStatus)) {
        events.push({
            type: "provider",
            label: PROVIDER_STATUS_LABELS[providerStatus] || "Estado informado por el proveedor",
            occurredAt: updatedAt,
            description: "Última actualización de entrega registrada.",
        });
    } else if (providerStatus === "sent" && updatedAt && !sentAt) {
        events.push({
            type: "accepted",
            label: "Aceptada por Meta",
            occurredAt: updatedAt,
            description: "Meta confirmó la aceptación del mensaje.",
        });
    } else if (record.status === "Failed" && updatedAt) {
        events.push({
            type: "failed",
            label: "Fallida en el sistema",
            occurredAt: updatedAt,
            description: "El último intento de envío no se completó.",
        });
    } else if (record.status === "Cancelled" && updatedAt) {
        events.push({
            type: "cancelled",
            label: "Envío cancelado",
            occurredAt: updatedAt,
            description: "El sistema canceló la notificación antes de enviarla.",
        });
    } else if (record.status === "Processing" && updatedAt) {
        events.push({
            type: "processing",
            label: "En proceso",
            occurredAt: updatedAt,
            description: "El sistema está procesando el envío.",
        });
    } else if (record.last_error && record.attempt_count > 0 && updatedAt) {
        events.push({
            type: "retry",
            label: "Último intento con error",
            occurredAt: updatedAt,
            description: getSafeFailure(record.last_error)?.description,
        });
    }

    return events.sort((first, second) => first.occurredAt.localeCompare(second.occurredAt));
}

function mapNotificationDetails(notification) {
    const record = notification.get({ plain: true });
    const failed = record.status === "Failed" || record.provider_delivery_status === "failed";

    return {
        id: record.id,
        eventType: EVENT_LABELS[record.event_type] || "Notificación del sistema",
        channel: CHANNEL_LABELS[record.channel] || "Canal no disponible",
        recipientName: getPatientName(record.patient),
        maskedRecipient: maskRecipient(record.recipient_address),
        applicationStatus: APPLICATION_STATUS_LABELS[record.status] || "Estado no disponible",
        providerStatus:
            PROVIDER_STATUS_LABELS[record.provider_delivery_status] ||
            "Sin confirmación final del proveedor",
        providerReference: maskProviderReference(record.provider_message_id),
        createdAt: toIsoTimestamp(record.created_at),
        scheduledAt: toIsoTimestamp(record.scheduled_at),
        acceptedAt: toIsoTimestamp(record.sent_at),
        updatedAt: toIsoTimestamp(record.updated_at),
        attemptCount: Number(record.attempt_count) || 0,
        failure: failed ? getSafeFailure(record.last_error) : null,
        appointment: record.appointment
            ? {
                  id: record.appointment.id,
                  startAt: toIsoTimestamp(record.appointment.start_at),
                  endAt: toIsoTimestamp(record.appointment.end_at),
                  status:
                      APPOINTMENT_STATUS_LABELS[record.appointment.status?.name] ||
                      (record.appointment.status?.name ? "Estado registrado" : null),
              }
            : null,
        events: buildDeliveryEvents(record),
        eventHistoryNote:
            "Se muestran los eventos y marcas de tiempo disponibles en el registro actual; no existe un historial inmutable de cada intento.",
    };
}

export async function getAdminNotificationDetails(notificationId) {
    const id = parseNotificationId(notificationId);
    const notification = await Notification.findByPk(id, {
        attributes: [
            "id",
            "appointment_id",
            "channel",
            "recipient_address",
            "event_type",
            "status",
            "scheduled_at",
            "sent_at",
            "attempt_count",
            "provider_message_id",
            "provider_delivery_status",
            // Read the stored error only to map it to a safe display category.
            "last_error",
            "created_at",
            "updated_at",
        ],
        include: [
            { model: Patient, as: "patient", attributes: ["first_name", "last_name"] },
            {
                model: Appointment,
                as: "appointment",
                attributes: ["id", "start_at", "end_at"],
                required: false,
                include: [
                    {
                        model: AppointmentStatus,
                        as: "status",
                        attributes: ["name"],
                        required: false,
                    },
                ],
            },
        ],
    });

    if (!notification) throw createServiceError("No encontramos la notificación solicitada.", 404);
    return mapNotificationDetails(notification);
}
