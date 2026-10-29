import { Op } from "sequelize";
import {
    Appointment,
    AppointmentStatus,
    Doctor,
    DoctorAvailability,
    DoctorScheduleException,
    Patient,
    Specialities,
} from "../../../models/associations.js";

const TIME_ZONE = "America/Bogota";
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

const APPOINTMENT_STATUS_LABELS = {
    Confirmed: "Confirmada",
    "In Progress": "En curso",
    Attended: "Atendida",
    Cancelled: "Cancelada",
};

const EXCEPTION_TYPE_LABELS = {
    Unavailable: "Horario no disponible",
    AdditionalAvailability: "Disponibilidad adicional",
};

function createServiceError(message, statusCode) {
    return Object.assign(new Error(message), { statusCode });
}

function getBogotaDateString(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
}

export function getCurrentDoctorAgendaDate(now = new Date()) {
    return getBogotaDateString(now);
}

function parseCalendarDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw createServiceError("Selecciona una fecha válida para consultar la agenda.", 400);
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw createServiceError("Selecciona una fecha válida para consultar la agenda.", 400);
    }
    return parsed;
}

function getDateRange(dateString) {
    const start = new Date(`${dateString}T05:00:00.000Z`);
    return { start, end: new Date(start.getTime() + DAY_IN_MILLISECONDS) };
}

function getWeekdayNumber(date) {
    const day = date.getUTCDay();
    return day === 0 ? 7 : day;
}

function getTimeParts(date) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return { hour: Number(values.hour), minute: Number(values.minute) };
}

function getMinutesInDay(date) {
    const { hour, minute } = getTimeParts(date);
    return hour * 60 + minute;
}

function formatTime(date) {
    return new Intl.DateTimeFormat("es-CO", {
        timeZone: TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
    }).format(date);
}

function formatTimeRange(startMinute, endMinute) {
    return {
        startMinute,
        endMinute,
        startTime: formatMinute(startMinute),
        endTime: formatMinute(endMinute),
    };
}

function formatMinute(value) {
    const normalized = ((value % 1440) + 1440) % 1440;
    const date = new Date(Date.UTC(2020, 0, 1, Math.floor(normalized / 60), normalized % 60, 0));
    return new Intl.DateTimeFormat("es-CO", {
        timeZone: "UTC",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
    }).format(date);
}

function parseTimeValue(value) {
    const [hour, minute] = String(value).slice(0, 5).split(":").map(Number);
    return hour * 60 + minute;
}

function safePhotoUrl(value) {
    return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
        ? value
        : null;
}

function getDisplayName(patient) {
    return [patient?.first_name, patient?.last_name].filter(Boolean).join(" ") || "Paciente";
}

function serializeAppointment(appointment) {
    const startAt = new Date(appointment.start_at);
    const endAt = new Date(appointment.end_at);
    const status = appointment.status?.name || "Confirmed";
    const startMinute = getMinutesInDay(startAt);
    let endMinute = getMinutesInDay(endAt);
    if (endAt.getTime() > startAt.getTime() && endMinute <= startMinute) endMinute += 1440;

    return {
        id: appointment.id,
        patientName: getDisplayName(appointment.patient),
        patientPhotoUrl: safePhotoUrl(appointment.patient?.profile_photo_url),
        reason: appointment.specialty?.name || "Consulta médica",
        status,
        statusLabel: APPOINTMENT_STATUS_LABELS[status] || status,
        startMinute,
        endMinute: Math.min(endMinute, 1440),
        startTime: formatTime(startAt),
        endTime: formatTime(endAt),
    };
}

function serializeAvailability(record) {
    return formatTimeRange(parseTimeValue(record.start_time), parseTimeValue(record.end_time));
}

function serializeException(record, dayStart, dayEnd) {
    const startAt = new Date(record.start_at);
    const endAt = new Date(record.end_at);
    const clippedStart = startAt < dayStart ? 0 : getMinutesInDay(startAt);
    const clippedEnd = endAt >= dayEnd ? 1440 : getMinutesInDay(endAt);
    const range = formatTimeRange(clippedStart, clippedEnd);

    return {
        ...range,
        type: record.exception_type,
        label: EXCEPTION_TYPE_LABELS[record.exception_type] || "Excepción de horario",
    };
}

function getTimelineRange(availability, exceptions, appointments) {
    const intervals = [
        ...availability,
        ...exceptions,
        ...appointments.map((appointment) => ({
            startMinute: appointment.startMinute,
            endMinute: appointment.endMinute,
        })),
    ].filter((interval) => interval.endMinute > interval.startMinute);

    if (!intervals.length) return null;
    const startHour = Math.floor(Math.min(...intervals.map(({ startMinute }) => startMinute)) / 60);
    const endHour = Math.min(
        24,
        Math.ceil(Math.max(...intervals.map(({ endMinute }) => endMinute)) / 60),
    );
    return { startHour, endHour: Math.max(startHour + 1, endHour) };
}

/** Return the signed-in doctor's agenda for one Bogota calendar day. */
export async function getDoctorAgendaData(userId, rawDate, now = new Date()) {
    const selectedDate = rawDate
        ? parseCalendarDate(rawDate)
        : parseCalendarDate(getBogotaDateString(now));
    const dateString = selectedDate.toISOString().slice(0, 10);
    const { start: dayStart, end: dayEnd } = getDateRange(dateString);
    const doctor = await Doctor.findOne({
        where: { user_id: userId },
        attributes: ["id"],
    });
    if (!doctor) return null;

    const [appointments, availabilityRecords, exceptionRecords] = await Promise.all([
        Appointment.findAll({
            where: {
                doctor_id: doctor.id,
                start_at: { [Op.gte]: dayStart, [Op.lt]: dayEnd },
            },
            attributes: ["id", "start_at", "end_at"],
            include: [
                {
                    model: Patient,
                    as: "patient",
                    attributes: ["first_name", "last_name", "profile_photo_url"],
                    required: true,
                },
                {
                    model: AppointmentStatus,
                    as: "status",
                    attributes: ["name"],
                    required: true,
                },
                {
                    model: Specialities,
                    as: "specialty",
                    attributes: ["name"],
                    required: false,
                },
            ],
            order: [
                ["start_at", "ASC"],
                ["id", "ASC"],
            ],
        }),
        DoctorAvailability.findAll({
            where: {
                doctor_id: doctor.id,
                day_of_week: getWeekdayNumber(selectedDate),
                is_active: true,
                valid_from: { [Op.lte]: dateString },
                [Op.or]: [{ valid_until: null }, { valid_until: { [Op.gte]: dateString } }],
            },
            attributes: ["id", "start_time", "end_time"],
            order: [["start_time", "ASC"]],
        }),
        DoctorScheduleException.findAll({
            where: {
                doctor_id: doctor.id,
                is_active: true,
                start_at: { [Op.lt]: dayEnd },
                end_at: { [Op.gt]: dayStart },
            },
            attributes: ["id", "start_at", "end_at", "exception_type"],
            order: [["start_at", "ASC"]],
        }),
    ]);

    const serializedAvailability = availabilityRecords.map(serializeAvailability);
    const serializedExceptions = exceptionRecords.map((record) =>
        serializeException(record, dayStart, dayEnd),
    );
    const serializedAppointments = appointments.map(serializeAppointment);

    return {
        selectedDate: dateString,
        dateLabel: new Intl.DateTimeFormat("es-CO", {
            timeZone: TIME_ZONE,
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
        }).format(dayStart),
        isToday: dateString === getBogotaDateString(now),
        workingPeriods: serializedAvailability,
        exceptions: serializedExceptions,
        appointments: serializedAppointments,
        timeline: getTimelineRange(
            serializedAvailability,
            serializedExceptions,
            serializedAppointments,
        ),
    };
}
