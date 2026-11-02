import { QueryTypes } from "sequelize";
import database from "../../../../config/database.js";
import {
    AppointmentHistory,
    Doctor,
    DoctorAppointmentNotificationRead,
} from "../../../models/associations.js";

const SUPPORTED_EVENTS = ["Created", "Rescheduled", "Cancelled"];
const PAGE_SIZE = 20;
const MAX_PAGE = 10000;
const EVENT_LABELS = {
    Created: "Nueva cita asignada",
    Rescheduled: "Cita reprogramada",
    Cancelled: "Cita cancelada",
};

function createServiceError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parsePositiveInteger(value, fallback, maximum) {
    if (value === undefined || value === null || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
        throw createServiceError("El número de página no es válido.", 400);
    }
    return parsed;
}

async function getDoctorId(userId) {
    const doctor = await Doctor.findOne({
        where: { user_id: userId },
        attributes: ["id"],
    });
    if (!doctor) throw createServiceError("No se encontró el perfil médico.", 404);
    return doctor.id;
}

function formatNotification(event) {
    const appointmentDate = event.appointment?.start_at;
    return {
        id: event.id,
        eventType: event.event_type,
        label: EVENT_LABELS[event.event_type],
        occurredAt: event.occurred_at,
        occurredAtLabel: formatDateTime(event.occurred_at),
        appointmentAt: appointmentDate || null,
        appointmentAtLabel: appointmentDate ? formatDateTime(appointmentDate) : null,
        isRead: Boolean(event.doctorReadStates?.length),
    };
}

function formatDateTime(value) {
    return new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Bogota",
    }).format(value);
}

async function countUnreadForDoctor(doctorId) {
    const result = await database.query(
        `SELECT COUNT(*) AS unreadCount
         FROM appointment_history AS history
         INNER JOIN appointments AS appointment
             ON appointment.id = history.appointment_id
         LEFT JOIN doctor_appointment_notification_reads AS read_state
             ON read_state.appointment_history_id = history.id
             AND read_state.doctor_id = :doctorId
         WHERE appointment.doctor_id = :doctorId
             AND history.event_type IN (:eventTypes)
             AND read_state.id IS NULL`,
        {
            replacements: { doctorId, eventTypes: SUPPORTED_EVENTS },
            type: QueryTypes.SELECT,
        },
    );
    return Number(result[0]?.unreadCount || 0);
}

export async function getDoctorNotifications(userId, query = {}) {
    const doctorId = await getDoctorId(userId);
    const page = parsePositiveInteger(query.page, 1, MAX_PAGE);
    const { count, rows } = await AppointmentHistory.findAndCountAll({
        where: { event_type: SUPPORTED_EVENTS },
        attributes: ["id", "event_type", "occurred_at"],
        include: [
            {
                association: "appointment",
                attributes: ["start_at"],
                required: true,
                where: { doctor_id: doctorId },
            },
            {
                association: "doctorReadStates",
                attributes: ["id"],
                required: false,
                where: { doctor_id: doctorId },
            },
        ],
        distinct: true,
        order: [
            ["occurred_at", "DESC"],
            ["id", "DESC"],
        ],
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
    });

    const unreadCount = await countUnreadForDoctor(doctorId);

    const totalPages = Math.ceil(count / PAGE_SIZE);
    return {
        items: rows.map(formatNotification),
        page,
        pageSize: PAGE_SIZE,
        totalItems: count,
        totalPages,
        unreadCount,
    };
}

export async function getDoctorUnreadNotificationCount(userId) {
    const doctorId = await getDoctorId(userId);
    return countUnreadForDoctor(doctorId);
}

export async function markDoctorNotificationRead(userId, rawEventId) {
    const eventId = parsePositiveInteger(rawEventId, null, Number.MAX_SAFE_INTEGER);
    if (!eventId) throw createServiceError("No encontramos esa notificación.", 404);

    const doctorId = await getDoctorId(userId);
    const event = await AppointmentHistory.findOne({
        where: { id: eventId, event_type: SUPPORTED_EVENTS },
        attributes: ["id"],
        include: [
            {
                association: "appointment",
                attributes: ["id"],
                required: true,
                where: { doctor_id: doctorId },
            },
        ],
    });
    if (!event) throw createServiceError("No encontramos esa notificación.", 404);

    await DoctorAppointmentNotificationRead.findOrCreate({
        where: { doctor_id: doctorId, appointment_history_id: event.id },
        defaults: { read_at: new Date() },
    });

    return { id: event.id, isRead: true };
}

export async function markAllDoctorNotificationsRead(userId) {
    const doctorId = await getDoctorId(userId);

    await database.query(
        `INSERT IGNORE INTO doctor_appointment_notification_reads
            (doctor_id, appointment_history_id, read_at)
         SELECT :doctorId, history.id, NOW()
         FROM appointment_history AS history
         INNER JOIN appointments AS appointment
             ON appointment.id = history.appointment_id
         LEFT JOIN doctor_appointment_notification_reads AS read_state
             ON read_state.appointment_history_id = history.id
             AND read_state.doctor_id = :doctorId
         WHERE appointment.doctor_id = :doctorId
             AND history.event_type IN (:eventTypes)
             AND read_state.id IS NULL`,
        { replacements: { doctorId, eventTypes: SUPPORTED_EVENTS } },
    );

    return { unreadCount: await countUnreadForDoctor(doctorId) };
}
