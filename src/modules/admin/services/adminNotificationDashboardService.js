import { col, fn, Op, where } from "sequelize";
import { Notification, Patient } from "../../../models/associations.js";

const BOGOTA_TIME_ZONE = "America/Bogota";
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PERIOD_DAYS = 30;
const SUPPORTED_PERIODS = [7, 30, 90];
const PAGE_SIZE = 8;
const MAX_PAGE = 10_000;
const MAX_CUSTOM_RANGE_DAYS = 366;

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

function parseCalendarDate(value, label) {
    if (value === undefined || value === "") return null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw createServiceError(`La ${label} no es válida.`);
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw createServiceError(`La ${label} no es válida.`);
    }
    return value;
}

function getBogotaBoundary(date, nextDay = false) {
    const [year, month, day] = date.split("-").map(Number);
    const boundary = new Date(0);
    boundary.setUTCHours(5, 0, 0, 0);
    boundary.setUTCFullYear(year, month - 1, day + Number(nextDay));
    return boundary;
}

function getSelectedRange(filters, referenceDate) {
    if (filters.period !== "custom") return getPeriodRange(referenceDate, filters.period);
    return {
        start: getBogotaBoundary(filters.startDate),
        end: getBogotaBoundary(filters.endDate, true),
    };
}

function parseInteger(value, fallback, label, maximum) {
    if (value === undefined) return fallback;
    if (!(typeof value === "string" || typeof value === "number") || !/^\d+$/.test(String(value))) {
        throw createServiceError(`El ${label} no es válido.`);
    }

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
        throw createServiceError(`El ${label} no es válido.`);
    }
    return parsed;
}

function getMatchingEventTypes(search) {
    const normalizedSearch = search
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    return Object.entries(EVENT_LABELS)
        .filter(([eventType, label]) => {
            const normalizedLabel = label
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();
            return (
                normalizedLabel.includes(normalizedSearch) || eventType.includes(normalizedSearch)
            );
        })
        .map(([eventType]) => eventType);
}

function buildSearchConditions(search) {
    const pattern = `%${search}%`;
    const conditions = [
        { "$patient.first_name$": { [Op.like]: pattern } },
        { "$patient.last_name$": { [Op.like]: pattern } },
        where(fn("CONCAT_WS", " ", col("patient.first_name"), col("patient.last_name")), {
            [Op.like]: pattern,
        }),
        { recipient_address: { [Op.like]: pattern } },
        { event_type: { [Op.like]: pattern } },
        where(fn("JSON_UNQUOTE", fn("JSON_EXTRACT", col("Notification.payload"), "$.date")), {
            [Op.like]: pattern,
        }),
        where(fn("JSON_UNQUOTE", fn("JSON_EXTRACT", col("Notification.payload"), "$.time")), {
            [Op.like]: pattern,
        }),
    ];
    const matchingEventTypes = getMatchingEventTypes(search);
    if (matchingEventTypes.length) {
        conditions.push({ event_type: { [Op.in]: matchingEventTypes } });
    }
    return conditions;
}

function parseQuery(query) {
    const periodValue = query.period === undefined ? DEFAULT_PERIOD_DAYS : query.period;
    if (typeof periodValue !== "string" && typeof periodValue !== "number") {
        throw createServiceError("Selecciona un período válido.");
    }
    const periodText = String(periodValue);
    if (periodText !== "custom" && !/^\d+$/.test(periodText)) {
        throw createServiceError("Selecciona un período válido.");
    }
    const period = periodText === "custom" ? "custom" : Number(periodText);
    const page = parseInteger(query.page, 1, "número de página", MAX_PAGE);
    const channel = query.channel === undefined ? "all" : query.channel;
    const status = query.status === undefined ? "all" : query.status;
    const searchValue = query.search === undefined ? "" : query.search;
    const search = typeof searchValue === "string" ? searchValue.trim() : null;
    const startDate = parseCalendarDate(query.startDate, "fecha inicial");
    const endDate = parseCalendarDate(query.endDate, "fecha final");

    if (typeof channel !== "string" || typeof status !== "string") {
        throw createServiceError("Los filtros seleccionados no son válidos.");
    }
    if (search === null) {
        throw createServiceError("El texto de búsqueda no es válido.");
    }
    if ((startDate && !endDate) || (!startDate && endDate)) {
        throw createServiceError("Selecciona ambas fechas del rango.");
    }
    if (startDate && endDate && startDate > endDate) {
        throw createServiceError("La fecha inicial no puede ser posterior a la fecha final.");
    }
    if (startDate && endDate) {
        const start = new Date(`${startDate}T00:00:00.000Z`);
        const end = new Date(`${endDate}T00:00:00.000Z`);
        const rangeDays = (end - start) / DAY_IN_MS + 1;
        if (rangeDays > MAX_CUSTOM_RANGE_DAYS) {
            throw createServiceError("El rango no puede superar 366 días.");
        }
    }

    const selectedPeriod = startDate && endDate ? "custom" : period;
    if (selectedPeriod === "custom" && (!startDate || !endDate)) {
        throw createServiceError("Selecciona ambas fechas del rango.");
    }
    if (selectedPeriod !== "custom" && !SUPPORTED_PERIODS.includes(selectedPeriod)) {
        throw createServiceError("Selecciona un período válido.");
    }
    if (!Object.hasOwn(CHANNEL_LABELS, channel) && channel !== "all") {
        throw createServiceError("Selecciona un canal disponible.");
    }
    if (!["all", "pending", "accepted", "delivered", "failed", "cancelled"].includes(status)) {
        throw createServiceError("Selecciona un estado disponible.");
    }
    if (search.length > 100) {
        throw createServiceError("La búsqueda no puede superar 100 caracteres.");
    }

    return { period: selectedPeriod, page, channel, status, search, startDate, endDate };
}

function buildListWhere({ channel, status, search, range }) {
    const conditions = [{ created_at: { [Op.gte]: range.start, [Op.lt]: range.end } }];
    if (channel !== "all") conditions.push({ channel });
    if (search) conditions.push({ [Op.or]: buildSearchConditions(search) });

    if (status === "pending") {
        conditions.push({ status: { [Op.in]: ["Pending", "Processing"] } });
    } else if (status === "accepted") {
        conditions.push({
            status: "Sent",
            [Op.or]: [{ provider_delivery_status: null }, { provider_delivery_status: "sent" }],
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

function payloadText(value, fallback) {
    return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : fallback;
}

function messagePreviewFor(row) {
    if (row.channel === "WhatsApp") {
        // Meta template text is provider-managed and is not stored with this notification.
        return "Plantilla de WhatsApp administrada por el proveedor; texto no almacenado.";
    }

    const date = payloadText(row.payloadDate, "día programado");
    const time = payloadText(row.payloadTime, "hora programada");
    const appointmentTime = `el ${date} a las ${time}`;
    const ending = time.endsWith(".") ? "" : ".";
    const previews = {
        appointment_reminder: `SaludVital: Te recordamos tu cita ${appointmentTime}${ending}`,
        appointment_reschedule: `SaludVital: Tu cita fue reprogramada para ${appointmentTime}${ending}`,
        appointment_cancellation: `SaludVital: Tu cita del ${date} fue cancelada.`,
    };

    return (
        previews[row.event_type] ||
        "Vista previa no disponible; el contenido del mensaje no está almacenado."
    );
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
        messagePreview: messagePreviewFor(row),
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

function buildListQuery(filters, range) {
    return {
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
            // Select only appointment date/time for the safe preview.
            [fn("JSON_UNQUOTE", fn("JSON_EXTRACT", col("payload"), "$.date")), "payloadDate"],
            [fn("JSON_UNQUOTE", fn("JSON_EXTRACT", col("payload"), "$.time")), "payloadTime"],
        ],
        include: [
            {
                model: Patient,
                as: "patient",
                attributes: ["first_name", "last_name"],
                required: false,
            },
        ],
        where: buildListWhere({ ...filters, range }),
        order: [
            [fn("COALESCE", col("Notification.sent_at"), col("Notification.created_at")), "DESC"],
            ["id", "DESC"],
        ],
        limit: PAGE_SIZE,
        offset: (filters.page - 1) * PAGE_SIZE,
        distinct: true,
    };
}

export async function getAdminNotificationDashboard(query = {}, referenceDate = new Date()) {
    const filters = parseQuery(query);
    const range = getSelectedRange(filters, referenceDate);

    const [groupedRows, result] = await Promise.all([
        Notification.findAll({
            attributes: [
                "status",
                "provider_delivery_status",
                [fn("COUNT", col("Notification.id")), "count"],
            ],
            include: [{ model: Patient, as: "patient", attributes: [], required: false }],
            where: buildListWhere({ ...filters, range }),
            group: ["status", "provider_delivery_status"],
            raw: true,
        }),
        Notification.findAndCountAll(buildListQuery(filters, range)),
    ]);

    const totalItems = toCount(result.count);
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    if (filters.page > totalPages) {
        filters.page = totalPages;
        result.rows = (await Notification.findAndCountAll(buildListQuery(filters, range))).rows;
    }
    const summary = summarizeMetrics(groupedRows);

    return {
        period: {
            days: filters.period === "custom" ? null : filters.period,
            startDate: filters.startDate,
            endDate: filters.endDate,
            start: range.start.toISOString(),
            end: range.end.toISOString(),
            timeZone: BOGOTA_TIME_ZONE,
        },
        summary,
        rows: result.rows.map(toHistoryItem),
        filters: {
            period: filters.period,
            channel: filters.channel,
            status: filters.status,
            search: filters.search,
            startDate: filters.startDate,
            endDate: filters.endDate,
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
