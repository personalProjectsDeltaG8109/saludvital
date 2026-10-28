import { col, fn, Op } from "sequelize";
import "../../../models/associations.js";
import Notification from "../../../models/Notification.js";
import Patient from "../../../models/Patient.js";
import Specialities from "../../../models/Specialities.js";
import WhatsAppAppointmentRequest from "../../../models/WhatsAppAppointmentRequest.js";
import WhatsAppConversation from "../../../models/WhatsAppConversation.js";
import WhatsAppMessage from "../../../models/WhatsAppMessage.js";
import { getWhatsAppIntegrationStatus } from "./adminDashboardService.js";

const PAGE_SIZE = 8;
const SUMMARY_LIMIT = 6;
const MAX_PAGE = 10000;
const MAX_SEARCH_LENGTH = 100;
const MESSAGE_PAGE_SIZE = 40;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const REQUEST_METRIC_DAYS = 30;
const BOGOTA_TIME_ZONE = "America/Bogota";
const SUPPORTED_TABS = ["summary", "conversations", "requests", "flows", "templates", "settings"];
const REQUEST_STATUSES = {
    Pending: "Pendientes",
    Confirmed: "Confirmadas",
    Rejected: "Rechazadas",
    Cancelled: "Canceladas",
    Expired: "Vencidas",
};
const SUPPORTED_ACTIVITY_DAYS = [7, 30];
const CONVERSATION_STATUSES = ["Active", "Completed", "Expired", "Blocked"];
const EVENT_LABELS = {
    appointment_reminder: "Recordatorio de cita",
    appointment_reschedule: "Reprogramación de cita",
    appointment_cancellation: "Cancelación de cita",
};
const REQUEST_STATUS_COLORS = {
    Pending: "#168de2",
    Confirmed: "#13b87a",
    Rejected: "#ff747b",
    Cancelled: "#f59e0b",
    Expired: "#9aa9bc",
};
const MESSAGE_TYPE_LABELS = {
    text: "Texto",
    image: "Imagen",
    audio: "Audio",
    document: "Documento",
    interactive: "Interacción",
};
const PROCESSING_STATUS_LABELS = {
    Received: "Recibido",
    Processing: "En proceso",
    Processed: "Procesado",
    Failed: "Error",
};

function createServiceError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parsePagination(query) {
    const page = query.page === undefined ? 1 : Number(query.page);
    if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) {
        throw createServiceError("El número de página no es válido.", 400);
    }
    const tab = query.tab || "summary";
    if (!SUPPORTED_TABS.includes(tab)) {
        throw createServiceError("La sección solicitada no es válida.", 400);
    }
    const activityDays = query.period === undefined ? 7 : Number(query.period);
    if (!SUPPORTED_ACTIVITY_DAYS.includes(activityDays)) {
        throw createServiceError("El período de actividad no es válido.", 400);
    }
    const search = typeof query.search === "string" ? query.search.trim() : "";
    if (search.length > MAX_SEARCH_LENGTH) {
        throw createServiceError("La búsqueda supera el máximo permitido.", 400);
    }
    const status = query.status || "";
    if (status && !CONVERSATION_STATUSES.includes(status)) {
        throw createServiceError("El estado de conversación no es válido.", 400);
    }
    return { page, tab, activityDays, search, status };
}

function parseConversationId(value) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) {
        throw createServiceError("La conversación solicitada no es válida.", 400);
    }
    return id;
}

function maskPhoneNumber(value) {
    if (!value) return null;
    const digits = String(value).replace(/\\D/g, "");
    return digits.length > 3 ? `••••${digits.slice(-3)}` : "•••";
}

function buildConversationWhere(search, status) {
    const where = {};
    if (status) where.status = status;
    if (search) {
        const pattern = `%${search}%`;
        where[Op.or] = [
            { "$patient.first_name$": { [Op.like]: pattern } },
            { "$patient.last_name$": { [Op.like]: pattern } },
            { "$patient.phone$": { [Op.like]: pattern } },
            { "$patient.notification_whatsapp_phone$": { [Op.like]: pattern } },
        ];
    }
    return where;
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

function getPeriodRange(referenceDate, days) {
    const { year, month, day } = getBogotaDateParts(referenceDate);
    const todayStart = new Date(Date.UTC(year, month - 1, day, 5));
    return {
        start: new Date(todayStart.getTime() - (days - 1) * DAY_IN_MS),
        end: new Date(todayStart.getTime() + DAY_IN_MS),
    };
}

function getDateKey(value) {
    if (typeof value === "string") return value.slice(0, 10);
    const { year, month, day } = getBogotaDateParts(value);
    return [year, String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
}

function formatDayLabel(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Intl.DateTimeFormat("es-CO", {
        timeZone: BOGOTA_TIME_ZONE,
        weekday: "short",
        day: "numeric",
    })
        .format(new Date(Date.UTC(year, month - 1, day, 12)))
        .replace(".", "")
        .replace(/^./, (letter) => letter.toUpperCase());
}

function buildConversationActivity(rows, range, days) {
    const countsByDate = new Map(rows.map((row) => [getDateKey(row.date), Number(row.count) || 0]));
    return Array.from({ length: days }, (_, index) => {
        const date = new Date(range.start.getTime() + index * DAY_IN_MS);
        const key = getDateKey(date);
        return { date: key, label: formatDayLabel(key), count: countsByDate.get(key) || 0 };
    });
}

function getPatientName(patient) {
    const name = [patient?.first_name, patient?.last_name].filter(Boolean).join(" ").trim();
    return name || "Usuario de WhatsApp";
}

async function countByField(model, field, where = {}) {
    const rows = await model.findAll({
        attributes: [field, [fn("COUNT", col("id")), "count"]],
        where,
        group: [field],
        raw: true,
    });
    return Object.fromEntries(rows.map((row) => [row[field], Number(row.count) || 0]));
}

function addStatusLabels(counts, labels) {
    return Object.entries(labels).map(([status, label]) => ({
        status,
        label,
        count: Number(counts[status]) || 0,
    }));
}

function getDeliveryStatusLabel(status) {
    const labels = {
        Pending: "Pendiente",
        Processing: "En proceso",
        Sent: "Enviado",
        Failed: "Fallido",
        Cancelled: "Cancelado",
    };
    return labels[status] || "Estado registrado";
}

function addRequestPercentages(statuses) {
    const total = statuses.reduce((sum, item) => sum + item.count, 0);
    let start = 0;
    const segments = statuses.map((item) => {
        const percentage = total ? (item.count / total) * 100 : 0;
        const segment = {
            ...item,
            color: REQUEST_STATUS_COLORS[item.status],
            percentage,
            start,
            end: start + percentage * 3.6,
        };
        start = segment.end;
        return segment;
    });
    const gradient = total
        ? segments
              .filter((segment) => segment.count > 0)
              .map((segment) => `${segment.color} ${segment.start}deg ${segment.end}deg`)
              .join(", ")
        : "#e8eef7 0deg 360deg";
    return { statuses: segments, total, style: `conic-gradient(${gradient})` };
}

function buildPagination(count, page, pageSize = PAGE_SIZE) {
    const totalPages = Math.max(1, Math.ceil(count / pageSize));
    return {
        page: Math.min(page, totalPages),
        pageSize,
        totalItems: count,
        totalPages,
    };
}

async function findPage(model, options, requestedPage) {
    const result = await model.findAndCountAll({
        ...options,
        limit: PAGE_SIZE,
        offset: (requestedPage - 1) * PAGE_SIZE,
    });
    const pagination = buildPagination(result.count, requestedPage);

    if (pagination.page === requestedPage) {
        return { rows: result.rows, pagination };
    }

    const adjustedResult = await model.findAndCountAll({
        ...options,
        limit: PAGE_SIZE,
        offset: (pagination.page - 1) * PAGE_SIZE,
    });
    return { rows: adjustedResult.rows, pagination };
}

function getTemplateStatus() {
    return [
        {
            name: "Recordatorio de cita",
            configured: Boolean(
                process.env.TWILIO_WHATSAPP_REMINDER_CONTENT_SID?.trim() ||
                process.env.TWILIO_WHATSAPP_CONTENT_SID?.trim(),
            ),
        },
        {
            name: "Reprogramación de cita",
            configured: Boolean(process.env.TWILIO_WHATSAPP_RESCHEDULE_CONTENT_SID?.trim()),
        },
        {
            name: "Cancelación de cita",
            configured: Boolean(process.env.TWILIO_WHATSAPP_CANCELLATION_CONTENT_SID?.trim()),
        },
    ];
}

function getSafeIntegrationConfiguration() {
    return {
        provider: "Twilio",
        senderConfigured: Boolean(process.env.TWILIO_WHATSAPP_FROM?.trim()),
        credentialsConfigured: Boolean(
            process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim(),
        ),
        templates: getTemplateStatus(),
    };
}

function mapMessagePreview(message) {
    const record = message.get({ plain: true });
    const patientName = getPatientName(record.conversation?.patient);
    return {
        patientName,
        initials: patientName.charAt(0).toUpperCase(),
        direction: record.direction,
        directionLabel: record.direction === "Inbound" ? "Mensaje recibido" : "Mensaje enviado",
        messageType: record.message_type,
        messageTypeLabel: MESSAGE_TYPE_LABELS[record.message_type] || "Mensaje",
        processingStatus: record.processing_status,
        processingStatusLabel:
            PROCESSING_STATUS_LABELS[record.processing_status] || "Estado registrado",
        occurredAt: record.created_at,
    };
}

function mapAppointmentRequest(request) {
    const record = request.get({ plain: true });
    return {
        patientName: getPatientName(record.patient),
        specialty: record.requestedSpecialty?.name || null,
        status: record.status,
        statusLabel: REQUEST_STATUSES[record.status] || "Estado registrado",
        createdAt: record.created_at,
    };
}

/** Return administrator-only WhatsApp metrics and bounded, safe records. */
export async function getAdminWhatsAppData(query = {}, referenceDate = new Date()) {
    const { page, tab, activityDays, search, status } = parsePagination(query);
    const today = getPeriodRange(referenceDate, 1);
    const activityRange = getPeriodRange(referenceDate, activityDays);
    const requestsRange = getPeriodRange(referenceDate, REQUEST_METRIC_DAYS);
    const todayRequestWhere = { created_at: { [Op.gte]: today.start, [Op.lt]: today.end } };
    const requestsPeriodWhere = {
        created_at: { [Op.gte]: requestsRange.start, [Op.lt]: requestsRange.end },
    };
    const [
        conversationCounts,
        todayRequestCounts,
        notificationAlertCount,
        activityRows,
        requestStatusCounts,
        todayConversations,
        sentToday,
        failedToday,
        recentMessages,
        recentRequests,
        recentEvents,
    ] = await Promise.all([
        countByField(WhatsAppConversation, "status"),
        countByField(WhatsAppAppointmentRequest, "status", todayRequestWhere),
        Notification.count({ where: { status: "Failed" } }),
        WhatsAppConversation.findAll({
            attributes: [
                [fn("DATE", col("started_at")), "date"],
                [fn("COUNT", col("id")), "count"],
            ],
            where: { started_at: { [Op.gte]: activityRange.start, [Op.lt]: activityRange.end } },
            group: [fn("DATE", col("started_at"))],
            order: [[fn("DATE", col("started_at")), "ASC"]],
            raw: true,
        }),
        countByField(WhatsAppAppointmentRequest, "status", requestsPeriodWhere),
        WhatsAppConversation.count({
            where: { started_at: { [Op.gte]: today.start, [Op.lt]: today.end } },
        }),
        Notification.count({
            where: {
                channel: "WhatsApp",
                status: "Sent",
                sent_at: { [Op.gte]: today.start, [Op.lt]: today.end },
            },
        }),
        Notification.count({
            where: {
                channel: "WhatsApp",
                status: "Failed",
                updated_at: { [Op.gte]: today.start, [Op.lt]: today.end },
            },
        }),
        WhatsAppMessage.findAll({
            attributes: ["direction", "message_type", "processing_status", "created_at"],
            include: [
                {
                    model: WhatsAppConversation,
                    as: "conversation",
                    attributes: [],
                    include: [
                        { model: Patient, as: "patient", attributes: ["first_name", "last_name"] },
                    ],
                },
            ],
            order: [["created_at", "DESC"]],
            limit: SUMMARY_LIMIT,
        }),
        WhatsAppAppointmentRequest.findAll({
            attributes: ["id", "requested_start_at", "status", "created_at"],
            include: [
                { model: Patient, as: "patient", attributes: ["first_name", "last_name"] },
                { model: Specialities, as: "requestedSpecialty", attributes: ["name"] },
            ],
            order: [["created_at", "DESC"]],
            limit: SUMMARY_LIMIT,
        }),
        Notification.findAll({
            attributes: ["event_type", "status", "created_at", "updated_at", "sent_at"],
            where: { channel: "WhatsApp" },
            order: [["updated_at", "DESC"]],
            limit: SUMMARY_LIMIT,
        }),
    ]);

    const recentMessagePreviews = recentMessages.map(mapMessagePreview);
    const recentSystemEvents = recentEvents.map((event) => ({
        event: EVENT_LABELS[event.event_type] || "Notificación de WhatsApp",
        status: event.status,
        statusLabel: getDeliveryStatusLabel(event.status),
        occurredAt: event.sent_at || event.updated_at || event.created_at,
    }));
    const requestStatusChart = addRequestPercentages(
        addStatusLabels(requestStatusCounts, REQUEST_STATUSES),
    );
    const integrationStatus = getWhatsAppIntegrationStatus();
    const requestsToday = Object.values(todayRequestCounts).reduce(
        (total, count) => total + (Number(count) || 0),
        0,
    );

    const dashboard = {
        selectedTab: tab,
        summary: {
            conversationsToday: Number(todayConversations) || 0,
            requestsToday,
            pendingRequestsToday: Number(todayRequestCounts.Pending) || 0,
            sentToday: Number(sentToday) || 0,
            failedToday: Number(failedToday) || 0,
            activeConversations: Number(conversationCounts.Active) || 0,
            configurationStatus: integrationStatus,
        },
        integrationConfiguration: getSafeIntegrationConfiguration(),
        chatbotStatus: "Unknown",
        chatbotStatusMessage: "No hay una verificación operativa del chatbot disponible.",
        conversationsByDay: buildConversationActivity(activityRows, activityRange, activityDays),
        appointmentRequestStatuses: requestStatusChart.statuses,
        requestStatusTotal: requestStatusChart.total,
        requestStatusStyle: requestStatusChart.style,
        recentRequests: recentRequests.map(mapAppointmentRequest),
        recentSystemEvents,
        recentMessagePreviews,
        notificationAlertCount: Number(notificationAlertCount) || 0,
        activityPeriodDays: activityDays,
        flowUnavailableMessage: "No hay un catálogo de flujos del chatbot disponible.",
    };

    let rows = [];
    let pagination = buildPagination(0, page);

    if (tab === "summary") rows = recentMessagePreviews;

    if (tab === "conversations") {
        const result = await findPage(
            WhatsAppConversation,
            {
                attributes: ["id", "status", "started_at", "last_activity_at"],
                include: [
                    {
                        model: Patient,
                        as: "patient",
                        attributes: [
                            "first_name",
                            "last_name",
                            "phone",
                            "notification_whatsapp_phone",
                        ],
                        required: Boolean(search),
                    },
                ],
                where: buildConversationWhere(search, status),
                order: [
                    ["last_activity_at", "DESC"],
                    ["id", "DESC"],
                ],
                distinct: true,
            },
            page,
        );
        pagination = result.pagination;
        rows = result.rows.map((conversation) => {
            const record = conversation.get({ plain: true });
            return {
                id: record.id,
                patientName: getPatientName(record.patient),
                contactNumber: maskPhoneNumber(
                    record.patient?.notification_whatsapp_phone || record.patient?.phone,
                ),
                status: record.status,
                statusLabel:
                    {
                        Active: "Activa",
                        Completed: "Finalizada",
                        Expired: "Vencida",
                        Blocked: "Bloqueada",
                    }[record.status] || "Estado registrado",
                startedAt: record.started_at,
                lastActivityAt: record.last_activity_at,
            };
        });
    }

    if (tab === "requests") {
        const result = await findPage(
            WhatsAppAppointmentRequest,
            {
                attributes: ["id", "requested_start_at", "status", "created_at"],
                include: [
                    { model: Patient, as: "patient", attributes: ["first_name", "last_name"] },
                    { model: Specialities, as: "requestedSpecialty", attributes: ["name"] },
                ],
                order: [["created_at", "DESC"]],
                distinct: true,
            },
            page,
        );
        pagination = result.pagination;
        rows = result.rows.map(mapAppointmentRequest);
    }

    return { ...dashboard, rows, pagination, search, status };
}

/** Return one persisted conversation and a bounded chronological message page. */
export async function getAdminWhatsAppConversation(
    conversationId,
    query = {},
    referenceDate = new Date(),
) {
    const id = parseConversationId(conversationId);
    const page = query.page === undefined ? 1 : Number(query.page);
    if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) {
        throw createServiceError("El número de página no es válido.", 400);
    }

    const conversation = await WhatsAppConversation.findByPk(id, {
        attributes: ["id", "status", "started_at", "last_activity_at", "ended_at"],
        include: [
            {
                model: Patient,
                as: "patient",
                attributes: ["first_name", "last_name", "phone", "notification_whatsapp_phone"],
            },
        ],
    });
    if (!conversation) throw createServiceError("No se encontró la conversación.", 404);

    const result = await WhatsAppMessage.findAndCountAll({
        attributes: [
            "id",
            "direction",
            "message_type",
            "content",
            "processing_status",
            "delivery_status",
            "received_at",
            "content_expires_at",
            "created_at",
        ],
        where: { conversation_id: id },
        order: [
            ["created_at", "ASC"],
            ["id", "ASC"],
        ],
        limit: MESSAGE_PAGE_SIZE,
        offset: (page - 1) * MESSAGE_PAGE_SIZE,
    });
    const pagination = buildPagination(result.count, page, MESSAGE_PAGE_SIZE);
    const actualPage = Math.min(page, pagination.totalPages);
    let messages = result.rows;
    if (actualPage !== page) {
        const adjusted = await WhatsAppMessage.findAndCountAll({
            attributes: [
                "id",
                "direction",
                "message_type",
                "content",
                "processing_status",
                "delivery_status",
                "received_at",
                "content_expires_at",
                "created_at",
            ],
            where: { conversation_id: id },
            order: [
                ["created_at", "ASC"],
                ["id", "ASC"],
            ],
            limit: MESSAGE_PAGE_SIZE,
            offset: (actualPage - 1) * MESSAGE_PAGE_SIZE,
        });
        messages = adjusted.rows;
    }

    const record = conversation.get({ plain: true });
    return {
        conversation: {
            id: record.id,
            patientName: getPatientName(record.patient),
            contactNumber: maskPhoneNumber(
                record.patient?.notification_whatsapp_phone || record.patient?.phone,
            ),
            status: record.status,
            statusLabel:
                {
                    Active: "Activa",
                    Completed: "Finalizada",
                    Expired: "Vencida",
                    Blocked: "Bloqueada",
                }[record.status] || "Estado registrado",
            startedAt: record.started_at,
            lastActivityAt: record.last_activity_at,
            endedAt: record.ended_at,
        },
        messages: messages.map((message) => {
            const item = message.get({ plain: true });
            const contentExpired =
                item.content_expires_at && new Date(item.content_expires_at) <= referenceDate;
            return {
                id: item.id,
                direction: item.direction,
                messageType: item.message_type,
                content: contentExpired ? null : item.content,
                contentExpired: Boolean(contentExpired),
                processingStatus: item.processing_status,
                deliveryStatus: item.delivery_status,
                occurredAt: item.received_at || item.created_at,
            };
        }),
        pagination: { ...pagination, page: actualPage },
    };
}
