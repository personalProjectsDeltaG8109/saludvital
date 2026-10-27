import { Op } from "sequelize";
import {
    Appointment,
    AppointmentStatus,
    Doctor,
    DoctorAvailability,
    DoctorScheduleException,
    Specialities,
} from "../../../models/associations.js";
import { APPOINTMENT_SLOT_MINUTES } from "../../../config/appointmentScheduling.js";

const BOGOTA_TIME_ZONE = "America/Bogota";
const WEEKDAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const APPOINTMENT_STATUS_LABELS = {
    Confirmed: "Confirmada",
    "In Progress": "En curso",
    Attended: "Asistida",
};

function serviceError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parseDoctorId(value) {
    const doctorId = Number(value);
    if (!Number.isSafeInteger(doctorId) || doctorId < 1) {
        throw serviceError("El médico seleccionado no es válido.");
    }
    return doctorId;
}

function parseDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
    return parsed;
}

function formatDate(date) {
    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0"),
    ].join("-");
}

function addDays(dateString, days) {
    const date = new Date(`${dateString}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return formatDate(date);
}

function getWeek(rawWeekStart) {
    const startDate = parseDate(rawWeekStart);
    if (!startDate || startDate.getUTCDay() !== 1) {
        throw serviceError("La semana seleccionada debe comenzar un lunes.");
    }
    const start = rawWeekStart;
    const end = addDays(start, 6);
    return {
        start,
        end,
        startAt: new Date(`${start}T05:00:00.000Z`),
        endAt: new Date(`${addDays(start, 7)}T05:00:00.000Z`),
    };
}

function getBogotaParts(value) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: BOGOTA_TIME_ZONE,
        weekday: "short",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date(value));
    return Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
}

function getWeekDates(weekStart) {
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function formatTime(value) {
    return String(value).slice(0, 5);
}

function formatDoctorName(doctor) {
    return doctor.display_name || `Médico ${doctor.id}`;
}

function isValidForDate(block, date) {
    return (
        String(block.valid_from).slice(0, 10) <= date &&
        (!block.valid_until || String(block.valid_until).slice(0, 10) >= date)
    );
}

function formatAvailability(block) {
    return {
        id: block.id,
        type: "available",
        label: "Disponible",
        startTime: formatTime(block.start_time),
        endTime: formatTime(block.end_time),
        reason: null,
    };
}

function formatTimedRecord(record, type, date) {
    const dayStart = new Date(`${date}T05:00:00.000Z`);
    const dayEnd = new Date(`${addDays(date, 1)}T05:00:00.000Z`);
    const startsAt = new Date(record.start_at);
    const endsAt = new Date(record.end_at);
    if (startsAt >= dayEnd || endsAt <= dayStart) return null;

    const clippedStart = startsAt < dayStart ? dayStart : startsAt;
    const clippedEnd = endsAt > dayEnd ? dayEnd : endsAt;
    const startParts = getBogotaParts(clippedStart);
    const endParts = getBogotaParts(clippedEnd);
    const interval = {
        startTime: `${startParts.hour}:${startParts.minute}`,
        endTime:
            endParts.date === addDays(date, 1) ? "24:00" : `${endParts.hour}:${endParts.minute}`,
    };

    if (type === "appointment") {
        const status = record.status?.name;
        const label = APPOINTMENT_STATUS_LABELS[status];
        if (!label) return null;
        return {
            id: record.id,
            type,
            label,
            reference: `Cita #${record.id}`,
            status,
            statusLabel: label,
            ...interval,
        };
    }

    const isUnavailable = record.exception_type === "Unavailable";
    return {
        id: record.id,
        type: isUnavailable ? "blocked" : "additionalAvailability",
        label: isUnavailable ? "No disponible" : "Disponible adicional",
        reason: record.reason,
        ...interval,
    };
}

function getWorkingDays(availability, dates) {
    return dates.flatMap((date, index) => {
        const intervals = availability
            .filter((block) => block.day_of_week === index + 1 && isValidForDate(block, date))
            .map((block) => ({
                startTime: formatTime(block.start_time),
                endTime: formatTime(block.end_time),
            }));
        return intervals.length
            ? [{ date, dayOfWeek: index + 1, dayLabel: WEEKDAY_LABELS[index], intervals }]
            : [];
    });
}

/** Return real doctor availability and appointment events for one Bogota week. */
export async function getAdminDoctorWeeklySchedule(rawDoctorId, rawWeekStart) {
    const doctorId = parseDoctorId(rawDoctorId);
    const week = getWeek(rawWeekStart);
    const doctor = await Doctor.findByPk(doctorId, {
        attributes: ["id", "display_name", "profile_photo_url"],
        include: [
            { model: Specialities, as: "specialty", attributes: ["id", "name"], required: false },
        ],
    });
    if (!doctor) throw serviceError("No encontramos al médico seleccionado.", 404);

    const [availability, exceptions, appointments] = await Promise.all([
        DoctorAvailability.findAll({
            where: {
                doctor_id: doctorId,
                is_active: true,
                valid_from: { [Op.lte]: week.end },
                [Op.or]: [{ valid_until: null }, { valid_until: { [Op.gte]: week.start } }],
            },
            attributes: [
                "id",
                "day_of_week",
                "start_time",
                "end_time",
                "valid_from",
                "valid_until",
            ],
            order: [
                ["day_of_week", "ASC"],
                ["start_time", "ASC"],
            ],
        }),
        DoctorScheduleException.findAll({
            where: {
                doctor_id: doctorId,
                exception_type: { [Op.in]: ["Unavailable", "AdditionalAvailability"] },
                start_at: { [Op.lt]: week.endAt },
                end_at: { [Op.gt]: week.startAt },
            },
            attributes: ["id", "start_at", "end_at", "exception_type", "reason"],
            order: [["start_at", "ASC"]],
        }),
        Appointment.findAll({
            where: {
                doctor_id: doctorId,
                start_at: { [Op.lt]: week.endAt },
                end_at: { [Op.gt]: week.startAt },
            },
            attributes: ["id", "start_at", "end_at"],
            include: [
                {
                    model: AppointmentStatus,
                    as: "status",
                    attributes: ["name"],
                    required: true,
                    where: { name: { [Op.in]: Object.keys(APPOINTMENT_STATUS_LABELS) } },
                },
            ],
            order: [["start_at", "ASC"]],
        }),
    ]);

    const dates = getWeekDates(week.start);
    const days = dates.map((date, index) => {
        const localEvents = [
            ...availability
                .filter((block) => block.day_of_week === index + 1 && isValidForDate(block, date))
                .map(formatAvailability),
            ...exceptions
                .map((exception) => formatTimedRecord(exception, "exception", date))
                .filter(Boolean),
            ...appointments
                .map((appointment) => formatTimedRecord(appointment, "appointment", date))
                .filter(Boolean),
        ].sort((left, right) => left.startTime.localeCompare(right.startTime));

        return {
            date,
            dayOfWeek: index + 1,
            dayLabel: WEEKDAY_LABELS[index],
            events: localEvents,
        };
    });
    const workingDays = getWorkingDays(availability, dates);

    return {
        doctor: {
            id: doctor.id,
            name: formatDoctorName(doctor),
            profilePhotoUrl: doctor.profile_photo_url || null,
            specialty: doctor.specialty?.name || null,
        },
        week: { start: week.start, end: week.end },
        appointmentDurationMinutes: APPOINTMENT_SLOT_MINUTES,
        workingDays,
        availabilityBlocks: availability
            .filter((block) =>
                dates.some(
                    (date, index) => block.day_of_week === index + 1 && isValidForDate(block, date),
                ),
            )
            .map((block) => ({
                id: block.id,
                dayOfWeek: block.day_of_week,
                dayLabel: WEEKDAY_LABELS[block.day_of_week - 1],
                startTime: formatTime(block.start_time),
                endTime: formatTime(block.end_time),
                validFrom: String(block.valid_from).slice(0, 10),
                validUntil: block.valid_until ? String(block.valid_until).slice(0, 10) : null,
            })),
        days,
    };
}
