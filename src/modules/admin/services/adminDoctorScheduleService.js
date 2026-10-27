import { Op } from "sequelize";
import {
    Doctor,
    DoctorAvailability,
    DoctorScheduleException,
    Specialities,
    User,
} from "../../../models/associations.js";

const BOGOTA_TIME_ZONE = "America/Bogota";
const MAX_SEARCH_LENGTH = 100;
const WEEKDAY_NUMBERS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const WEEKDAY_LABELS = {
    1: "Lunes",
    2: "Martes",
    3: "Miércoles",
    4: "Jueves",
    5: "Viernes",
    6: "Sábado",
    7: "Domingo",
};

function serviceError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parsePositiveInteger(value, label) {
    if (value === undefined || value === null || value === "") return null;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        throw serviceError(`${label} no es válido.`);
    }
    return parsed;
}

function parseCalendarDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function formatDate(date) {
    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0"),
    ].join("-");
}

function addCalendarDays(dateString, dayCount) {
    const date = new Date(`${dateString}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + dayCount);
    return formatDate(date);
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
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
        date: `${values.year}-${values.month}-${values.day}`,
        dayOfWeek: WEEKDAY_NUMBERS[values.weekday],
        time: `${values.hour}:${values.minute}`,
    };
}

function getCurrentBogotaDate(now) {
    return getBogotaParts(now).date;
}

function getBogotaDayStart(dateString) {
    return new Date(`${dateString}T05:00:00.000Z`);
}

function getWeekRange(rawWeekStart, now) {
    const currentDate = getCurrentBogotaDate(now);
    let weekStart = currentDate;

    if (rawWeekStart) {
        if (!parseCalendarDate(rawWeekStart)) {
            throw serviceError("La semana seleccionada no es válida.");
        }
        weekStart = rawWeekStart;
    } else {
        const date = new Date(`${currentDate}T00:00:00.000Z`);
        const dayOfWeek = date.getUTCDay() || 7;
        date.setUTCDate(date.getUTCDate() - dayOfWeek + 1);
        weekStart = formatDate(date);
    }

    const monday = new Date(`${weekStart}T00:00:00.000Z`);
    if (monday.getUTCDay() !== 1) {
        throw serviceError("La semana debe comenzar un lunes.");
    }

    return { start: weekStart, end: addCalendarDays(weekStart, 6) };
}

function formatTime(value) {
    return String(value).slice(0, 5);
}

function getDoctorName(doctor) {
    return doctor.display_name || doctor.user?.email || `Médico ${doctor.id}`;
}

function formatAvailability(block) {
    return {
        id: block.id,
        dayOfWeek: block.day_of_week,
        dayLabel: WEEKDAY_LABELS[block.day_of_week],
        startTime: formatTime(block.start_time),
        endTime: formatTime(block.end_time),
        validFrom: String(block.valid_from).slice(0, 10),
        validUntil: block.valid_until ? String(block.valid_until).slice(0, 10) : null,
    };
}

function matchesSearch(doctor, search) {
    if (!search) return true;
    const normalizedSearch = search.toLocaleLowerCase("es-CO");
    const name = doctor.name || getDoctorName(doctor);
    const email = doctor.email || doctor.user?.email || "";
    return [name, email].some((value) =>
        value.toLocaleLowerCase("es-CO").includes(normalizedSearch),
    );
}

/** Return the doctor schedule directory, filters, and real summary counts. */
export async function getAdminDoctorSchedules(query = {}, now = new Date()) {
    const search = typeof query.search === "string" ? query.search.trim() : "";
    if (search.length > MAX_SEARCH_LENGTH) {
        throw serviceError("La búsqueda no puede superar los 100 caracteres.");
    }

    const doctorId = parsePositiveInteger(query.doctorId, "El médico");
    const specialtyId = parsePositiveInteger(query.specialtyId, "La especialidad");
    const status = query.status || "all";
    if (!["all", "configured", "unconfigured"].includes(status)) {
        throw serviceError("El estado del horario seleccionado no es válido.");
    }

    const week = getWeekRange(query.weekStart, now);
    const exceptionWindowStart = getBogotaDayStart(getCurrentBogotaDate(now));
    const exceptionWindowEnd = getBogotaDayStart(addCalendarDays(getCurrentBogotaDate(now), 7));
    const [doctorRecords, exceptionRecords] = await Promise.all([
        Doctor.findAll({
            attributes: ["id", "display_name", "profile_photo_url"],
            include: [
                {
                    model: User,
                    as: "user",
                    attributes: ["id", "email", "is_active"],
                    required: true,
                },
                {
                    model: Specialities,
                    as: "specialty",
                    attributes: ["id", "name"],
                    required: false,
                },
                {
                    model: DoctorAvailability,
                    as: "availability",
                    attributes: [
                        "id",
                        "day_of_week",
                        "start_time",
                        "end_time",
                        "valid_from",
                        "valid_until",
                    ],
                    where: {
                        is_active: true,
                        valid_from: { [Op.lte]: week.end },
                        [Op.or]: [{ valid_until: null }, { valid_until: { [Op.gte]: week.start } }],
                    },
                    required: false,
                },
            ],
            order: [["display_name", "ASC"]],
        }),
        DoctorScheduleException.findAll({
            where: {
                is_active: true,
                start_at: { [Op.lt]: exceptionWindowEnd },
                end_at: { [Op.gt]: exceptionWindowStart },
            },
            attributes: ["id", "doctor_id", "start_at", "end_at", "exception_type", "reason"],
            include: [
                {
                    model: Doctor,
                    as: "doctor",
                    attributes: ["id", "display_name"],
                    include: [
                        { model: User, as: "user", attributes: ["email"], required: true },
                        {
                            model: Specialities,
                            as: "specialty",
                            attributes: ["name"],
                            required: false,
                        },
                    ],
                },
            ],
            order: [["start_at", "ASC"]],
        }),
    ]);

    const doctors = doctorRecords.map((record) => {
        const availability = (record.availability || []).map(formatAvailability);
        return {
            id: record.id,
            name: getDoctorName(record),
            email: record.user.email,
            profilePhotoUrl: record.profile_photo_url || null,
            isActive: Boolean(record.user.is_active),
            specialty: record.specialty
                ? { id: record.specialty.id, name: record.specialty.name }
                : null,
            hasSchedule: availability.length > 0,
            availability,
        };
    });

    const activeDoctors = doctors.filter((doctor) => doctor.isActive);
    const filters = doctors.filter((doctor) => {
        if (doctorId && doctor.id !== doctorId) return false;
        if (specialtyId && doctor.specialty?.id !== specialtyId) return false;
        if (!matchesSearch(doctor, search)) return false;
        if (status === "configured" && !doctor.hasSchedule) return false;
        if (status === "unconfigured" && doctor.hasSchedule) return false;
        return true;
    });

    return {
        summary: {
            activeDoctors: activeDoctors.length,
            configuredSchedules: activeDoctors.filter((doctor) => doctor.hasSchedule).length,
            upcomingExceptions: exceptionRecords.length,
        },
        doctors: filters,
        doctorOptions: doctors.map(({ id, name, email, isActive }) => ({
            id,
            name,
            email,
            isActive,
        })),
        specialtyOptions: await Specialities.findAll({
            where: { is_active: true },
            attributes: ["id", "name"],
            order: [["name", "ASC"]],
        }),
        exceptions: exceptionRecords.slice(0, 4).map((exception) => ({
            id: exception.id,
            doctorName: getDoctorName(exception.doctor),
            specialty: exception.doctor.specialty?.name || null,
            type: exception.exception_type,
            reason: exception.reason,
            startAt: new Date(exception.start_at).toISOString(),
            endAt: new Date(exception.end_at).toISOString(),
        })),
        week,
    };
}
