import { col, fn, Op } from "sequelize";
import {
    Appointment,
    AppointmentStatus,
    Doctor,
    Notification,
    Rol,
    Specialities,
    User,
} from "../../../models/associations.js";
import AuditLog from "../../../models/AuditLog.js";
import WhatsAppAppointmentRequest from "../../../models/WhatsAppAppointmentRequest.js";
import WhatsAppConversation from "../../../models/WhatsAppConversation.js";
import WhatsAppMessage from "../../../models/WhatsAppMessage.js";

const BOGOTA_TIME_ZONE = "America/Bogota";
const DAY_IN_MS = 24 * 60 * 60 * 1000;

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

function getWeekRange(referenceDate, previous = false) {
    const dayStart = getBogotaDayStart(referenceDate);
    const { year, month, day } = getBogotaDateParts(referenceDate);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const daysSinceMonday = (weekday + 6) % 7;
    const offset = previous ? 7 : 0;
    const start = new Date(dayStart.getTime() - (daysSinceMonday + offset) * DAY_IN_MS);
    return { start, end: new Date(start.getTime() + 7 * DAY_IN_MS) };
}

function formatDate(date, options) {
    return new Intl.DateTimeFormat("es-CO", {
        ...options,
        timeZone: BOGOTA_TIME_ZONE,
    }).format(date);
}

function dateKey(value) {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: BOGOTA_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(value instanceof Date ? value : new Date(value));
    const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
    return `${values.year}-${values.month}-${values.day}`;
}

function buildWeekDays(start) {
    return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(start.getTime() + index * DAY_IN_MS);
        return {
            date: dateKey(date),
            label: formatDate(date, { weekday: "short", day: "numeric" })
                .replace(".", "")
                .replace(/^./, (letter) => letter.toUpperCase()),
            scheduled: 0,
            completed: 0,
            cancelled: 0,
        };
    });
}

function toCount(value) {
    return Number(value) || 0;
}

export function getWhatsAppIntegrationStatus() {
    const senderConfigured = Boolean(process.env.TWILIO_WHATSAPP_FROM?.trim());
    const templateConfigured = Boolean(
        process.env.TWILIO_WHATSAPP_CONTENT_SID?.trim() ||
        process.env.TWILIO_WHATSAPP_REMINDER_CONTENT_SID?.trim(),
    );
    return senderConfigured && templateConfigured ? "Configured" : "Incomplete";
}

/** Return bounded administrator dashboard data using existing persisted records. */
export async function getAdminDashboardData(query = {}) {
    if (query.week !== undefined && !["current", "previous"].includes(query.week)) {
        const error = new Error("Selecciona un rango semanal válido.");
        error.statusCode = 400;
        throw error;
    }
    const selectedWeek = query.week === "previous" ? "previous" : "current";
    const now = new Date();
    const todayStart = getBogotaDayStart(now);
    const todayEnd = new Date(todayStart.getTime() + DAY_IN_MS);
    const week = getWeekRange(now, selectedWeek === "previous");
    const [doctorRole] = await Promise.all([
        Rol.findOne({ where: { name: "Doctor" }, attributes: ["id"], raw: true }),
    ]);

    const [
        registeredUsers,
        activeUsers,
        activeDoctors,
        todayStatusRows,
        weeklyRows,
        specialtyRows,
        pendingRequests,
        activeConversations,
        failedWhatsAppMessages,
        failedNotificationsToday,
        activityRows,
        notificationRows,
    ] = await Promise.all([
        User.count(),
        User.count({ where: { is_active: true } }),
        doctorRole
            ? Doctor.count({
                  include: [
                      {
                          model: User,
                          as: "user",
                          attributes: [],
                          required: true,
                          where: { is_active: true, role_id: doctorRole.id },
                      },
                  ],
              })
            : 0,
        Appointment.findAll({
            attributes: [
                [col("status.name"), "status"],
                [fn("COUNT", col("Appointment.id")), "count"],
            ],
            include: [{ model: AppointmentStatus, as: "status", attributes: [], required: true }],
            where: { start_at: { [Op.gte]: todayStart, [Op.lt]: todayEnd } },
            group: ["status.name"],
            raw: true,
        }),
        Appointment.findAll({
            attributes: [
                [fn("DATE", col("Appointment.start_at")), "date"],
                [col("status.name"), "status"],
                [fn("COUNT", col("Appointment.id")), "count"],
            ],
            include: [{ model: AppointmentStatus, as: "status", attributes: [], required: true }],
            where: { start_at: { [Op.gte]: week.start, [Op.lt]: week.end } },
            group: [fn("DATE", col("Appointment.start_at")), col("status.name")],
            order: [[fn("DATE", col("Appointment.start_at")), "ASC"]],
            raw: true,
        }),
        Appointment.findAll({
            attributes: [
                [col("specialty.name"), "name"],
                [fn("COUNT", col("Appointment.id")), "count"],
            ],
            include: [{ model: Specialities, as: "specialty", attributes: [], required: true }],
            where: { start_at: { [Op.gte]: todayStart, [Op.lt]: todayEnd } },
            group: ["specialty.id", "specialty.name"],
            order: [[fn("COUNT", col("Appointment.id")), "DESC"]],
            raw: true,
        }),
        WhatsAppAppointmentRequest.count({ where: { status: "Pending" } }),
        WhatsAppConversation.count({ where: { status: "Active" } }),
        WhatsAppMessage.count({
            where: {
                processing_status: "Failed",
                created_at: { [Op.gte]: todayStart, [Op.lt]: todayEnd },
            },
        }),
        Notification.count({
            where: {
                status: "Failed",
                scheduled_at: { [Op.gte]: todayStart, [Op.lt]: todayEnd },
            },
        }),
        AuditLog.findAll({
            attributes: ["action", "target_type", "result", "occurred_at"],
            order: [["occurred_at", "DESC"]],
            limit: 5,
            raw: true,
        }),
        Notification.findAll({
            attributes: ["event_type", "status", "scheduled_at", "sent_at"],
            where: { status: { [Op.in]: ["Failed", "Sent"] } },
            order: [["scheduled_at", "DESC"]],
            limit: 4,
            raw: true,
        }),
    ]);

    const weekDays = buildWeekDays(week.start);
    const weekDayByDate = new Map(weekDays.map((day) => [day.date, day]));
    for (const row of weeklyRows) {
        const day = weekDayByDate.get(dateKey(row.date));
        if (!day) continue;
        const count = toCount(row.count);
        if (["Confirmed", "In Progress"].includes(row.status)) day.scheduled += count;
        if (row.status === "Attended") day.completed += count;
        if (row.status === "Cancelled") day.cancelled += count;
    }

    const statusCounts = Object.fromEntries(
        todayStatusRows.map((row) => [row.status, toCount(row.count)]),
    );
    const appointmentCountToday = todayStatusRows.reduce(
        (total, row) => total + toCount(row.count),
        0,
    );
    const specialtyTotal = specialtyRows.reduce((total, row) => total + toCount(row.count), 0);

    return {
        generatedAt: now.toISOString(),
        selectedWeek,
        metrics: {
            registeredUsers,
            activeUsers,
            appointmentsToday: appointmentCountToday,
            completedAppointmentsToday: statusCounts.Attended || 0,
            activeDoctors,
            pendingWhatsAppRequests: pendingRequests,
        },
        weeklyAppointments: weekDays,
        specialties: specialtyRows.map((row) => ({
            name: row.name,
            count: toCount(row.count),
            percentage: specialtyTotal
                ? Math.round((toCount(row.count) / specialtyTotal) * 100)
                : 0,
        })),
        whatsapp: {
            integrationStatus: getWhatsAppIntegrationStatus(),
            activeConversations,
            pendingRequests,
            failedMessagesToday: failedWhatsAppMessages,
        },
        recentActivity: activityRows.map((row) => ({
            action: row.action,
            targetType: row.target_type,
            result: row.result,
            occurredAt: row.occurred_at,
        })),
        systemNotifications: notificationRows.map((row) => ({
            eventType: row.event_type,
            status: row.status,
            occurredAt: row.sent_at || row.scheduled_at,
        })),
        notificationAlertCount: failedNotificationsToday,
        range: { start: week.start.toISOString(), end: week.end.toISOString() },
    };
}
