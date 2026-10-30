import { Op } from "sequelize";
import { APPOINTMENT_SLOT_MINUTES } from "../../../config/appointmentScheduling.js";
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

function formatCalendarDate(date) {
    return date.toISOString().slice(0, 10);
}

function addCalendarDays(date, amount) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + amount);
    return result;
}

function getWeekStart(date) {
    const daysSinceMonday = (date.getUTCDay() + 6) % 7;
    return addCalendarDays(date, -daysSinceMonday);
}

function getCalendarPeriod(date, view) {
    if (view === "week") {
        const startDate = getWeekStart(date);
        const endDate = addCalendarDays(startDate, 7);
        return {
            startDate: formatCalendarDate(startDate),
            endDate: formatCalendarDate(endDate),
            dates: Array.from({ length: 7 }, (_, index) =>
                formatCalendarDate(addCalendarDays(startDate, index)),
            ),
        };
    }

    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const startDate = new Date(Date.UTC(year, month, 1));
    const endDate = new Date(Date.UTC(year, month + 1, 1));
    const dayCount = Math.round((endDate - startDate) / DAY_IN_MILLISECONDS);

    return {
        startDate: formatCalendarDate(startDate),
        endDate: formatCalendarDate(endDate),
        dates: Array.from({ length: dayCount }, (_, index) =>
            formatCalendarDate(addCalendarDays(startDate, index)),
        ),
    };
}

function formatDayLabel(dateString, options = { weekday: "short", day: "numeric" }) {
    const { start } = getDateRange(dateString);
    return new Intl.DateTimeFormat("es-CO", { timeZone: TIME_ZONE, ...options }).format(start);
}

function createAppointmentIncludes() {
    return [
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
            where: { name: "Confirmed" },
            required: true,
        },
        {
            model: Specialities,
            as: "specialty",
            attributes: ["name"],
            required: false,
        },
    ];
}

async function findConfirmedAppointments(doctorId, start, end) {
    return Appointment.findAll({
        where: {
            doctor_id: doctorId,
            start_at: { [Op.gte]: start, [Op.lt]: end },
        },
        attributes: ["id", "start_at", "end_at"],
        include: createAppointmentIncludes(),
        order: [
            ["start_at", "ASC"],
            ["id", "ASC"],
        ],
    });
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

function normalizeDateOnly(value) {
    return String(value).slice(0, 10);
}

function getPeriodWindows(periods) {
    const windows = periods
        .flatMap((dates) => {
            if (!dates.length) return [];
            const startDate = dates[0];
            const endDate = addCalendarDays(parseCalendarDate(dates.at(-1)), 1);
            return [{ startDate, endDate: formatCalendarDate(endDate) }];
        })
        .sort((first, second) => first.startDate.localeCompare(second.startDate));
    const merged = [];

    for (const window of windows) {
        const previous = merged.at(-1);
        if (previous && window.startDate <= previous.endDate) {
            if (window.endDate > previous.endDate) previous.endDate = window.endDate;
        } else {
            merged.push({ ...window });
        }
    }
    return merged;
}

function toBogotaDateTime(date, time) {
    return new Date(`${date}T${String(time).slice(0, 5)}:00-05:00`);
}

function mergeIntervals(intervals) {
    const sorted = intervals
        .filter(({ start, end }) => end > start)
        .sort((first, second) => first.start - second.start);
    const merged = [];

    for (const interval of sorted) {
        const previous = merged.at(-1);
        if (previous && interval.start <= previous.end) {
            previous.end = Math.max(previous.end, interval.end);
        } else {
            merged.push({ ...interval });
        }
    }
    return merged;
}

function subtractIntervals(intervals, blockedIntervals) {
    return intervals.flatMap((interval) => {
        const blocks = blockedIntervals
            .filter((block) => block.start < interval.end && block.end > interval.start)
            .sort((first, second) => first.start - second.start);
        const available = [];
        let cursor = interval.start;

        for (const block of blocks) {
            const blockStart = Math.max(block.start, interval.start);
            const blockEnd = Math.min(block.end, interval.end);
            if (blockStart > cursor) available.push({ start: cursor, end: blockStart });
            cursor = Math.max(cursor, blockEnd);
        }
        if (cursor < interval.end) available.push({ start: cursor, end: interval.end });
        return available;
    });
}

function getExceptionInterval(exception, dayStart, dayEnd) {
    return {
        start: Math.max(new Date(exception.start_at).getTime(), dayStart),
        end: Math.min(new Date(exception.end_at).getTime(), dayEnd),
    };
}

function getApplicableSchedules(schedules, date) {
    const selectedDate = parseCalendarDate(date);
    const dayOfWeek = getWeekdayNumber(selectedDate);
    return schedules.filter(
        (schedule) =>
            schedule.day_of_week === dayOfWeek &&
            normalizeDateOnly(schedule.valid_from) <= date &&
            (!schedule.valid_until || normalizeDateOnly(schedule.valid_until) >= date),
    );
}

function getDayAvailability(date, schedules, exceptions, appointments) {
    const { start: dayStart, end: dayEnd } = getDateRange(date);
    const dayStartTime = dayStart.getTime();
    const dayEndTime = dayEnd.getTime();
    const daySchedules = getApplicableSchedules(schedules, date);
    const dayExceptions = exceptions
        .filter(
            (exception) =>
                new Date(exception.start_at) < dayEnd && new Date(exception.end_at) > dayStart,
        )
        .map((exception) => ({
            ...exception,
            ...getExceptionInterval(exception, dayStartTime, dayEndTime),
        }));
    const standardIntervals = daySchedules.map((schedule) => ({
        start: toBogotaDateTime(date, schedule.start_time).getTime(),
        end: toBogotaDateTime(date, schedule.end_time).getTime(),
    }));
    const additionalIntervals = dayExceptions
        .filter(({ exception_type: type }) => type === "AdditionalAvailability")
        .map(({ start, end }) => ({ start, end }));
    const blockedIntervals = dayExceptions
        .filter(({ exception_type: type }) => type === "Unavailable")
        .map(({ start, end }) => ({ start, end }));
    const baseIntervals = mergeIntervals([...standardIntervals, ...additionalIntervals]);
    const usableIntervals = subtractIntervals(baseIntervals, blockedIntervals);
    const slotDuration = APPOINTMENT_SLOT_MINUTES * 60 * 1000;
    let capacitySlots = 0;
    const occupiedSlots = new Set();

    for (
        let slotStart = dayStartTime;
        slotStart + slotDuration <= dayEndTime;
        slotStart += slotDuration
    ) {
        const slotEnd = slotStart + slotDuration;
        const isUsable = usableIntervals.some(
            (interval) => interval.start <= slotStart && interval.end >= slotEnd,
        );
        if (isUsable) capacitySlots += 1;
        const isBooked = appointments.some(
            (appointment) =>
                new Date(appointment.start_at).getTime() < slotEnd &&
                new Date(appointment.end_at).getTime() > slotStart,
        );
        if (isUsable && isBooked) occupiedSlots.add(slotStart);
    }

    return {
        date,
        hasSchedule: baseIntervals.length > 0,
        capacitySlots,
        bookedSlots: occupiedSlots.size,
        workingPeriods: usableIntervals.map(
            ({ start, end }) => `${formatTime(new Date(start))} – ${formatTime(new Date(end))}`,
        ),
        exceptions: dayExceptions.map((exception) => ({
            label: EXCEPTION_TYPE_LABELS[exception.exception_type] || "Excepción de horario",
            startTime: formatTime(new Date(exception.start)),
            endTime: formatTime(new Date(exception.end)),
            allDay: exception.start <= dayStartTime && exception.end >= dayEndTime,
        })),
    };
}

function summarizeAvailability(label, dates, schedules, exceptions, appointments) {
    const days = dates.map((date) => getDayAvailability(date, schedules, exceptions, appointments));
    const capacitySlots = days.reduce((total, day) => total + day.capacitySlots, 0);
    const bookedSlots = days.reduce((total, day) => total + day.bookedSlots, 0);

    return {
        label,
        capacitySlots,
        bookedSlots,
        availableSlots: Math.max(0, capacitySlots - bookedSlots),
        hasSchedule: days.some((day) => day.hasSchedule),
        days: days.filter((day) => day.hasSchedule || day.exceptions.length > 0),
    };
}

/** Return read-only capacity summaries for the authenticated doctor's calendar periods. */
export async function getDoctorAvailabilitySummary(userId, rawSelectedDate, now = new Date()) {
    const selectedDate = rawSelectedDate
        ? parseCalendarDate(rawSelectedDate)
        : parseCalendarDate(getBogotaDateString(now));
    const selectedDateString = formatCalendarDate(selectedDate);
    const todayDates = [getBogotaDateString(now)];
    const week = getCalendarPeriod(selectedDate, "week");
    const month = getCalendarPeriod(selectedDate, "month");
    const windows = getPeriodWindows([todayDates, week.dates, month.dates]);
    const doctor = await Doctor.findOne({
        where: { user_id: userId },
        attributes: ["id"],
    });
    if (!doctor) return null;

    const availabilityWindows = windows.map((window) => ({
        valid_from: {
            [Op.lte]: formatCalendarDate(addCalendarDays(parseCalendarDate(window.endDate), -1)),
        },
        [Op.or]: [{ valid_until: null }, { valid_until: { [Op.gte]: window.startDate } }],
    }));
    const recordWindows = windows.map((window) => ({
        start_at: { [Op.lt]: getDateRange(window.endDate).start },
        end_at: { [Op.gt]: getDateRange(window.startDate).start },
    }));
    const [schedules, exceptions, appointments] = await Promise.all([
        DoctorAvailability.findAll({
            where: {
                doctor_id: doctor.id,
                is_active: true,
                [Op.or]: availabilityWindows,
            },
            attributes: [
                "id",
                "day_of_week",
                "start_time",
                "end_time",
                "valid_from",
                "valid_until",
            ],
        }),
        DoctorScheduleException.findAll({
            where: {
                doctor_id: doctor.id,
                is_active: true,
                [Op.or]: recordWindows,
            },
            attributes: ["id", "start_at", "end_at", "exception_type"],
        }),
        Appointment.findAll({
            where: {
                doctor_id: doctor.id,
                [Op.or]: recordWindows,
            },
            attributes: ["id", "start_at", "end_at"],
            include: [
                {
                    model: AppointmentStatus,
                    as: "status",
                    attributes: [],
                    required: true,
                    where: { name: { [Op.ne]: "Cancelled" } },
                },
            ],
        }),
    ]);

    return {
        appointmentDurationMinutes: APPOINTMENT_SLOT_MINUTES,
        today: summarizeAvailability(
            "Mi disponibilidad de hoy",
            todayDates,
            schedules,
            exceptions,
            appointments,
        ),
        week: summarizeAvailability(
            "Mi disponibilidad de la semana",
            week.dates,
            schedules,
            exceptions,
            appointments,
        ),
        month: summarizeAvailability(
            "Mi disponibilidad del mes",
            month.dates,
            schedules,
            exceptions,
            appointments,
        ),
        selectedDate: selectedDateString,
    };
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
        findConfirmedAppointments(doctor.id, dayStart, dayEnd),
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

/** Return bounded week or month summaries for the authenticated doctor's calendar. */
export async function getDoctorAgendaViewData(userId, rawView, rawDate, now = new Date()) {
    const view = rawView === undefined ? "day" : rawView;
    if (!["day", "week", "month"].includes(view)) {
        throw createServiceError("Selecciona una vista de agenda válida.", 400);
    }

    const selectedDate = rawDate
        ? parseCalendarDate(rawDate)
        : parseCalendarDate(getBogotaDateString(now));
    const selectedDateString = formatCalendarDate(selectedDate);
    if (view === "day") return getDoctorAgendaData(userId, selectedDateString, now);

    const doctor = await Doctor.findOne({
        where: { user_id: userId },
        attributes: ["id"],
    });
    if (!doctor) return null;

    const period = getCalendarPeriod(selectedDate, view);
    const { start } = getDateRange(period.startDate);
    const { start: end } = getDateRange(period.endDate);

    if (view === "week") {
        const appointments = await findConfirmedAppointments(doctor.id, start, end);
        const appointmentsByDate = new Map(period.dates.map((date) => [date, []]));
        appointments.forEach((appointment) => {
            const appointmentDate = getBogotaDateString(new Date(appointment.start_at));
            appointmentsByDate.get(appointmentDate)?.push(serializeAppointment(appointment));
        });

        return {
            view,
            selectedDate: selectedDateString,
            rangeStart: period.startDate,
            rangeEnd: formatCalendarDate(addCalendarDays(parseCalendarDate(period.endDate), -1)),
            periodLabel: `${formatDayLabel(period.startDate)} – ${formatDayLabel(
                formatCalendarDate(addCalendarDays(parseCalendarDate(period.endDate), -1)),
            )}`,
            days: period.dates.map((date) => ({
                date,
                dateLabel: formatDayLabel(date),
                appointments: appointmentsByDate.get(date),
            })),
        };
    }

    const appointmentDates = await Appointment.findAll({
        where: {
            doctor_id: doctor.id,
            start_at: { [Op.gte]: start, [Op.lt]: end },
        },
        attributes: ["start_at"],
        include: [
            {
                model: AppointmentStatus,
                as: "status",
                attributes: [],
                where: { name: "Confirmed" },
                required: true,
            },
        ],
    });
    const appointmentCounts = new Map();
    appointmentDates.forEach(({ start_at: startAt }) => {
        const date = getBogotaDateString(new Date(startAt));
        appointmentCounts.set(date, (appointmentCounts.get(date) || 0) + 1);
    });

    return {
        view,
        selectedDate: selectedDateString,
        rangeStart: period.startDate,
        rangeEnd: formatCalendarDate(addCalendarDays(parseCalendarDate(period.endDate), -1)),
        periodLabel: formatDayLabel(period.startDate, { month: "long", year: "numeric" }),
        days: period.dates.map((date) => ({
            date,
            dayNumber: Number(date.slice(-2)),
            appointmentCount: appointmentCounts.get(date) || 0,
            isToday: date === getBogotaDateString(now),
        })),
    };
}
