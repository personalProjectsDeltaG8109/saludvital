import { col, fn, Op } from "sequelize";
import { Notification, Patient } from "../../../models/associations.js";

const BOGOTA_TIME_ZONE = "America/Bogota";
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PERIOD_DAYS = 30;
const SUPPORTED_PERIODS = [7, 30, 90];
const PAGE_SIZE = 8;
const MAX_PAGE = 10_000;

const CHANNEL_LABELS = {
    Email: "Correo electrónico",
    WhatsApp: "WhatsApp",
    SMS: "SMS",
};

const EVENT_LABELS = {
    appointment_confirmation: "Confirmación de cita",
    appointment_reminder: "Recordatorio de cita",
    appointment_reschedule: "Cambio de cita",
    appointment_cancellation: "Cancelación de cita",
};

const EVENT_SUMMARIES = {
    appointment_confirmation: "Aviso de confirmación de cita",
    appointment_reminder: "Recordatorio de cita médica",
    appointment_reschedule: "Aviso de cambio en una cita",
    appointment_cancellation: "Aviso de cancelación de cita",
};

const APPLICATION_STATUS_LABELS = {
    Pending: "En cola",
    Processing: "En proceso",
    Sent: "Aceptado por el proveedor",
    Failed: "Fallido en el envío",
    Cancelled: "Cancelado",
};

const PROVIDER_STATUS_LABELS = {
    sent: "Aceptado por Meta",
    delivered: "Entregado por Meta",
    read: "Leído por Meta",
    failed: "Fallido según Meta",
};

function createServiceError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

function toCount(value) {
    return Number(value) || 0;
}

function getBogotaDateParts(date) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: BOGOTA_TIME_ZONE,
        year: "numeric",
        month: "numeric",
        day: "numeric",
    }).formatToParts(date);
    return Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
}

function getBogotaDayStart(date) {
    const { year, month, day } = getBogotaDateParts(date);
    return new Date(Date.UTC(year, month - 1, day, 5));
}

function getPeriodRange(referenceDate, periodDays) {
    const todayStart = getBogotaDayStart(referenceDate);
    const start = new Date(todayStart.getTime() - (periodDays - 1) * DAY_IN_MS);
    return { start, end: new Date(todayStart.getTime() + DAY_IN_MS) };
}

function parseQuery(query) {
    const period = query.period === undefined ? DEFAULT_PERIOD_DAYS : Number(query.period);
    const page = query.page === undefined ? 1 : Number(query.page);
    const channel = query.channel === undefined ? "all" : query.channel;
    const status = query.status === undefined ? "all" : query.status;
    const search = typeof query.search === "string" ? query.search.trim() : "";

    if (!SUPPORTED_PERIODS.includes(period)) {
        throw createServiceError("Selecciona un período válido.");
    }
    if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) {
        throw createServiceError("El número de página no es válido.");
    }
    if (!Object.hasOwn(CHANNEL_LABELS, channel) && channel !== "all") {
        throw createServiceError("Selecciona un canal disponible.");
    }
    if (!["all", "pending", "delivered", "failed", "cancelled"].includes(status)) {
        throw createServiceError("Selecciona un estado disponible.");
    }
    if (search.length > 100) {
        throw createServiceError("La búsqueda no puede superar 100 caracteres.");
    }

    return { period, page, channel, status, search };
}

function buildListWhere({ channel, status, search, range }) {
    const conditions = [{ created_at: { [Op.gte]: range.start, [Op.lt]: range.end } }];
    if (channel !== "all") conditions.push({ channel });
    if (search) {
        const pattern = `%${search}%`;
        conditions.push({
            [Op.or]: [
                { "$patient.first_name$": { [Op.like]: pattern } },
                { "$patient.last_name$": { [Op.like]: pattern } },
                { event_type: { [Op.like]: pattern } },
            ],
        });
    }

    if (status === "pending") {
        conditions.push({
            [Op.or]: [
                { status: { [Op.in]: ["Pending", "Processing"] } },
                {
                    status: "Sent",
                    [Op.or]: [
                        { provider_delivery_status: null },
                        { provider_delivery_status: "sent" },
                    ],
                },
            ],
        });
    } else if (status === "delivered") {
        conditions.push({ provider_delivery_status: { [Op.in]: ["delivered", "read"] } });
    } else if (status === "failed") {
        conditions.push({
            [Op.or]: [{ status: "Failed" }, { provider_delivery_status: "failed" }],
        });
    } else if (status === "cancelled") {
        conditions.push({ status: "Cancelled" });
    }

    return { [Op.and]: conditions };
}

function summarizeMetrics(groupedRows) {
    let totalSent = 0;
    let delivered = 0;
    let failed = 0;
    let pending = 0;

    for (const row of groupedRows) {
        const count = toCount(row.count);
        if (row.status === "Cancelled") continue;

        const providerReported = Boolean(row.provider_delivery_status);
        const acceptedByProvider = row.status === "Sent" || providerReported;
        if (acceptedByProvider) totalSent += count;

        if (["delivered", "read"].includes(row.provider_delivery_status)) {
            delivered += count;
        } else if (row.status === "Failed" || row.provider_delivery_status === "failed") {
            failed += count;
        } else if (
            ["Pending", "Processing"].includes(row.status) ||
            (row.status === "Sent" && [null, "sent"].includes(row.provider_delivery_status))
        ) {
            pending += count;
        }
    }

    return { totalSent, delivered, failed, pending };
}

function maskRecipient(value) {
    if (typeof value !== "string" || !value.trim()) return "Destino no disponible";
    const recipient = value.trim();
    if (recipient.includes("@")) {
        const [localPart, domain] = recipient.split("@", 2);
        if (!domain) return "Destino oculto";
        return `${localPart.slice(0, 1)}•••@${domain}`;
    }
    const digits = recipient.replaceAll(/\D/g, "");
    return digits.length >= 4 ? `••• ${digits.slice(-4)}` : "Destino oculto";
}

function providerLabel(status, channel) {
    if (status) return PROVIDER_STATUS_LABELS[status] || "Estado del proveedor no disponible";
    if (channel === "Email" || channel === "SMS" || channel === "WhatsApp") {
        return "Sin confirmación final del proveedor";
    }
    return "No disponible";
}

function toHistoryItem(notification) {
    const row = notification.get({ plain: true });
    const patientName = [row.patient?.first_name, row.patient?.last_name].filter(Boolean).join(" ");
    const providerFailed = row.provider_delivery_status === "failed";
    const failed = row.status === "Failed" || providerFailed;
    const confirmedDelivered = ["delivered", "read"].includes(row.provider_delivery_status);
    const applicationTone =
        row.status === "Failed"
            ? "error"
            : row.status === "Cancelled"
              ? "neutral"
              : row.status === "Sent"
                ? "success"
                : "pending";

    return {
        id: row.id,
        eventType: EVENT_LABELS[row.event_type] || "Notificación del sistema",
        summary: EVENT_SUMMARIES[row.event_type] || "Actualización generada por el sistema",
        channel: CHANNEL_LABELS[row.channel] || "Canal no disponible",
        recipientName: patientName || "Contacto sin nombre registrado",
        maskedRecipient: maskRecipient(row.recipient_address),
        occurredAt: row.sent_at || row.created_at,
        applicationStatus: APPLICATION_STATUS_LABELS[row.status] || "Estado no disponible",
        applicationTone,
        providerStatus: providerLabel(row.provider_delivery_status, row.channel),
        deliveryStatus: confirmedDelivered
            ? row.provider_delivery_status === "read"
                ? "Leída"
                : "Entregada"
            : failed
              ? "Fallida"
              : row.status === "Cancelled"
                ? "Cancelada"
                : "Pendiente",
        tone: confirmedDelivered ? "success" : failed ? "error" : "pending",
        failureSummary: failed
            ? providerFailed
                ? "El proveedor reportó un fallo de entrega."
                : "El sistema no pudo completar el envío."
            : null,
    };
}

export async function getAdminNotificationDashboard(query = {}, referenceDate = new Date()) {
    const filters = parseQuery(query);
    const range = getPeriodRange(referenceDate, filters.period);
    const createdAt = { [Op.gte]: range.start, [Op.lt]: range.end };

    const [groupedRows, result] = await Promise.all([
        Notification.findAll({
            attributes: ["status", "provider_delivery_status", [fn("COUNT", col("id")), "count"]],
            where: { created_at: createdAt },
            group: ["status", "provider_delivery_status"],
            raw: true,
        }),
        Notification.findAndCountAll({
            attributes: [
                "id",
                "recipient_address",
                "event_type",
                "channel",
                "status",
                "provider_delivery_status",
                "sent_at",
                "created_at",
                "updated_at",
            ],
            include: [
                {
                    model: Patient,
                    as: "patient",
                    attributes: ["first_name", "last_name"],
                    required: Boolean(filters.search),
                },
            ],
            where: buildListWhere({ ...filters, range }),
            order: [
                ["updated_at", "DESC"],
                ["id", "DESC"],
            ],
            limit: PAGE_SIZE,
            offset: (filters.page - 1) * PAGE_SIZE,
            distinct: true,
        }),
    ]);

    const totalItems = toCount(result.count);
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    const summary = summarizeMetrics(groupedRows);

    return {
        period: {
            days: filters.period,
            start: range.start.toISOString(),
            end: range.end.toISOString(),
            timeZone: BOGOTA_TIME_ZONE,
        },
        summary,
        rows: result.rows.map(toHistoryItem),
        filters: {
            channel: filters.channel,
            status: filters.status,
            search: filters.search,
        },
        pagination: {
            page: filters.page,
            pageSize: PAGE_SIZE,
            totalItems,
            totalPages,
        },
        deliverySemantics: {
            total: "Notificaciones aceptadas por el proveedor en el período, sin contar canceladas.",
            delivered: "Solo estados de entrega confirmados por Meta (delivered/read).",
            failed: "Fallo del worker o estado failed informado por Meta, contado una sola vez.",
            pending: "En cola, en proceso o aceptado sin confirmación final de entrega.",
        },
    };
}
