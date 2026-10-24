import { col, fn } from "sequelize";
import "../../../models/associations.js";
import Notification from "../../../models/Notification.js";
import Patient from "../../../models/Patient.js";
import Specialities from "../../../models/Specialities.js";
import Doctor from "../../../models/Doctor.js";
import WhatsAppAppointmentRequest from "../../../models/WhatsAppAppointmentRequest.js";
import WhatsAppConversation from "../../../models/WhatsAppConversation.js";
import WhatsAppMessage from "../../../models/WhatsAppMessage.js";
import { getWhatsAppIntegrationStatus } from "./adminDashboardService.js";

const PAGE_SIZE = 8;
const MAX_PAGE = 10000;

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
    if (!["summary", "conversations", "requests"].includes(tab)) {
        throw createServiceError("La sección solicitada no es válida.", 400);
    }
    return { page, tab };
}

function getPatientName(patient) {
    const name = [patient?.first_name, patient?.last_name].filter(Boolean).join(" ").trim();
    return name || "Usuario de WhatsApp";
}

async function countByField(model, field) {
    const rows = await model.findAll({
        attributes: [field, [fn("COUNT", col("id")), "count"]],
        group: [field],
        raw: true,
    });
    return Object.fromEntries(rows.map((row) => [row[field], Number(row.count) || 0]));
}

function buildPagination(count, page) {
    const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
    return {
        page: Math.min(page, totalPages),
        pageSize: PAGE_SIZE,
        totalItems: count,
        totalPages,
    };
}

/** Return administrator-only WhatsApp health summaries and safe, paginated records. */
export async function getAdminWhatsAppData(query = {}) {
    const { page, tab } = parsePagination(query);
    const [conversationCounts, requestCounts, messageCounts, failedNotificationCount] =
        await Promise.all([
            countByField(WhatsAppConversation, "status"),
            countByField(WhatsAppAppointmentRequest, "status"),
            countByField(WhatsAppMessage, "processing_status"),
            Notification.count({ where: { status: "Failed" } }),
        ]);

    const summary = {
        integrationStatus: getWhatsAppIntegrationStatus(),
        conversations: conversationCounts,
        appointmentRequests: requestCounts,
        messages: messageCounts,
    };

    let rows = [];
    let pagination = buildPagination(0, page);

    if (tab === "summary") {
        const recentMessages = await WhatsAppMessage.findAll({
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
            limit: 6,
        });
        rows = recentMessages.map((message) => {
            const record = message.get({ plain: true });
            return {
                patientName: getPatientName(record.conversation?.patient),
                direction: record.direction,
                messageType: record.message_type,
                processingStatus: record.processing_status,
                occurredAt: record.created_at,
            };
        });
    }

    if (tab === "conversations") {
        const result = await WhatsAppConversation.findAndCountAll({
            attributes: ["id", "status", "started_at", "last_activity_at"],
            include: [{ model: Patient, as: "patient", attributes: ["first_name", "last_name"] }],
            order: [["last_activity_at", "DESC"]],
            limit: PAGE_SIZE,
            offset: (page - 1) * PAGE_SIZE,
            distinct: true,
        });
        pagination = buildPagination(result.count, page);
        rows = result.rows.map((conversation) => {
            const record = conversation.get({ plain: true });
            return {
                id: record.id,
                patientName: getPatientName(record.patient),
                status: record.status,
                startedAt: record.started_at,
                lastActivityAt: record.last_activity_at,
            };
        });
    }

    if (tab === "requests") {
        const result = await WhatsAppAppointmentRequest.findAndCountAll({
            attributes: ["id", "requested_start_at", "status", "created_at"],
            include: [
                { model: Patient, as: "patient", attributes: ["first_name", "last_name"] },
                { model: Specialities, as: "requestedSpecialty", attributes: ["name"] },
                { model: Doctor, as: "requestedDoctor", attributes: ["display_name"] },
            ],
            order: [["created_at", "DESC"]],
            limit: PAGE_SIZE,
            offset: (page - 1) * PAGE_SIZE,
            distinct: true,
        });
        pagination = buildPagination(result.count, page);
        rows = result.rows.map((request) => {
            const record = request.get({ plain: true });
            return {
                id: record.id,
                patientName: getPatientName(record.patient),
                specialty: record.requestedSpecialty?.name || null,
                doctorName: record.requestedDoctor?.display_name || null,
                requestedStartAt: record.requested_start_at,
                status: record.status,
                createdAt: record.created_at,
            };
        });
    }

    return {
        selectedTab: tab,
        summary,
        notificationAlertCount: failedNotificationCount,
        rows,
        pagination,
    };
}
