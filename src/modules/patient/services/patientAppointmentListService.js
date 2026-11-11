import { Op, col, fn, literal, where } from "sequelize";
import {
    Appointment,
    AppointmentHistory,
    AppointmentStatus,
    Doctor,
    Patient,
    Specialities,
} from "../../../models/associations.js";
import { AppointmentError } from "../errors/appointmentError.js";

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const DEFAULT_PAGE_SIZE = 10;
const MAX_SEARCH_LENGTH = 100;
const MAX_FILTER_LENGTH = 100;
const SUPPORTED_STATUSES = ["Confirmed", "Attended", "Cancelled", "No Show"];
const SUPPORTED_TABS = ["all", "upcoming", "attended", "cancelled", "no-show"];
const STATUS_SUMMARY = [
    { key: "all", label: "Total de citas", status: null },
    { key: "confirmed", label: "Confirmadas", status: "Confirmed" },
    { key: "attended", label: "Atendidas", status: "Attended" },
    { key: "cancelled", label: "Canceladas", status: "Cancelled" },
    { key: "no-show", label: "No asistió", status: "No Show" },
];

function parsePositiveInteger(value, defaultValue, fieldName, maximum) {
    if (value === undefined || value === "") return defaultValue;

    if (typeof value !== "string" || !/^\d+$/.test(value)) {
        throw new AppointmentError(`El valor de ${fieldName} no es válido.`, 400);
    }

    const parsedValue = Number(value);
    if (!Number.isSafeInteger(parsedValue) || parsedValue < 1 || parsedValue > maximum) {
        throw new AppointmentError(`El valor de ${fieldName} no es válido.`, 400);
    }

    return parsedValue;
}

function normalizeQueryText(value, fieldName, maximumLength) {
    if (value === undefined || value === "") return "";
    if (typeof value !== "string" || value.length > maximumLength) {
        throw new AppointmentError(`El filtro de ${fieldName} no es válido.`, 400);
    }
    return value.trim();
}

function normalizeFilters(query) {
    const filter = query.filter === undefined ? "all" : query.filter;
    const status = normalizeQueryText(query.status, "estado", MAX_FILTER_LENGTH);
    const search = normalizeQueryText(query.search, "búsqueda", MAX_SEARCH_LENGTH);
    const specialty = normalizeQueryText(query.specialty, "especialidad", MAX_FILTER_LENGTH);

    if (typeof filter !== "string" || !SUPPORTED_TABS.includes(filter)) {
        throw new AppointmentError("El filtro de citas no es válido.", 400);
    }

    if (status && !SUPPORTED_STATUSES.includes(status)) {
        throw new AppointmentError("El estado seleccionado no es válido.", 400);
    }

    return { filter, status, search, specialty };
}

function getBogotaDateParts(date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function getBogotaStartOfToday(date) {
    const { year, month, day } = getBogotaDateParts(date);
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 5));
}

function getAppointmentListOrder(now) {
    const localTimeParts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(now);
    const localValues = Object.fromEntries(localTimeParts.map(({ type, value }) => [type, value]));
    const localNow = `${localValues.year}-${localValues.month}-${localValues.day} ${localValues.hour}:${localValues.minute}:${localValues.second}`;
    const isUpcomingConfirmed = `\`status\`.\`name\` = 'Confirmed' AND \`Appointment\`.\`start_at\` >= '${localNow}'`;

    // Preserve upcoming confirmed appointments first, then show history newest first.
    return [
        [literal(`CASE WHEN ${isUpcomingConfirmed} THEN 0 ELSE 1 END`), "ASC"],
        [literal(`CASE WHEN ${isUpcomingConfirmed} THEN \`Appointment\`.\`start_at\` END`), "ASC"],
        ["start_at", "DESC"],
        ["id", "DESC"],
    ];
}

function buildPageUrl(filters, page, pageSize) {
    const parameters = new URLSearchParams({
        filter: filters.filter,
        page: String(page),
        pageSize: String(pageSize),
    });
    for (const key of ["search", "specialty", "status"]) {
        if (filters[key]) parameters.set(key, filters[key]);
    }
    return `/patient/appointments?${parameters.toString()}`;
}

function escapeLikeValue(value) {
    return value.replace(/[\\%_]/g, "\\$&");
}

function buildAppointmentWhere(patientId, filters, startOfToday) {
    const whereConditions = [{ patient_id: patientId }];
    const statusConditions = [];

    if (filters.status) statusConditions.push({ name: filters.status });

    if (filters.filter === "upcoming") {
        whereConditions.push({ start_at: { [Op.gte]: startOfToday } });
        statusConditions.push({ name: { [Op.notIn]: ["Cancelled", "Attended"] } });
    } else if (filters.filter !== "all") {
        const tabStatuses = {
            attended: "Attended",
            cancelled: "Cancelled",
            "no-show": "No Show",
        };
        statusConditions.push({ name: tabStatuses[filters.filter] });
    }

    if (filters.search) {
        const searchPattern = `%${escapeLikeValue(filters.search)}%`;
        whereConditions.push({
            [Op.or]: [
                where(col("doctor.display_name"), { [Op.like]: searchPattern }),
                where(col("specialty.name"), { [Op.like]: searchPattern }),
            ],
        });
    }

    const specialtyInclude = {
        model: Specialities,
        as: "specialty",
        attributes: ["name"],
        required: Boolean(filters.specialty),
    };
    if (filters.specialty) specialtyInclude.where = { name: filters.specialty };

    const statusInclude = {
        model: AppointmentStatus,
        as: "status",
        attributes: ["name"],
        required: true,
    };
    if (statusConditions.length) statusInclude.where = { [Op.and]: statusConditions };

    return {
        where: { [Op.and]: whereConditions },
        include: [
            {
                model: Doctor,
                as: "doctor",
                attributes: ["display_name", "profile_photo_url"],
                required: Boolean(filters.search),
            },
            specialtyInclude,
            statusInclude,
        ],
    };
}

async function getPatientStatusCounts(patientId) {
    const groupedStatuses = await Appointment.findAll({
        attributes: ["status_id", [fn("COUNT", col("Appointment.id")), "count"]],
        where: { patient_id: patientId },
        include: [
            {
                model: AppointmentStatus,
                as: "status",
                attributes: ["name"],
                required: true,
            },
        ],
        group: ["Appointment.status_id", "status.id", "status.name"],
        raw: true,
    });
    const counts = Object.fromEntries(STATUS_SUMMARY.map(({ status }) => [status, 0]));

    for (const record of groupedStatuses) {
        const statusName = record["status.name"];
        if (Object.hasOwn(counts, statusName)) counts[statusName] = Number(record.count);
    }

    return STATUS_SUMMARY.map(({ key, label, status }) => ({
        key,
        label,
        status,
        count: status
            ? counts[status]
            : Object.values(counts).reduce((sum, count) => sum + count, 0),
    }));
}

async function getPatientSpecialties(patientId) {
    const specialties = await Specialities.findAll({
        attributes: ["id", "name"],
        include: [
            {
                model: Appointment,
                as: "appointments",
                attributes: [],
                where: { patient_id: patientId },
                required: true,
            },
        ],
        group: ["Specialities.id", "Specialities.name"],
        order: [["name", "ASC"]],
    });

    return specialties.map((specialty) => specialty.name);
}

export async function getPatientAppointmentList(userId, query = {}, now = new Date()) {
    const page = parsePositiveInteger(query.page, 1, "página", 20_000);
    const pageSize = parsePositiveInteger(
        query.pageSize,
        DEFAULT_PAGE_SIZE,
        "tamaño de página",
        50,
    );
    if (!PAGE_SIZE_OPTIONS.includes(pageSize)) {
        throw new AppointmentError("El tamaño de página seleccionado no es válido.", 400);
    }

    const filters = normalizeFilters(query);
    const patient = await Patient.findOne({
        where: { user_id: userId },
        attributes: ["id"],
    });

    if (!patient) {
        return {
            appointments: [],
            specialties: [],
            stats: STATUS_SUMMARY.map((stat) => ({ ...stat, count: 0 })),
            filters,
            pagination: {
                page: 1,
                pageSize,
                total: 0,
                totalPages: 0,
                firstResult: 0,
                lastResult: 0,
            },
        };
    }

    const todayStart = getBogotaStartOfToday(now);
    const appointmentQuery = buildAppointmentWhere(patient.id, filters, todayStart);
    const [total, stats, specialties] = await Promise.all([
        Appointment.count({ ...appointmentQuery, distinct: true }),
        getPatientStatusCounts(patient.id),
        getPatientSpecialties(patient.id),
    ]);
    const totalPages = Math.ceil(total / pageSize);
    const currentPage = totalPages === 0 ? 1 : Math.min(page, totalPages);
    const appointments = await Appointment.findAll({
        ...appointmentQuery,
        attributes: [
            "id",
            "start_at",
            "end_at",
            "reason",
            "status_id",
            "doctor_id",
            "specialty_id",
        ],
        include: [
            ...appointmentQuery.include,
            {
                model: AppointmentHistory,
                as: "history",
                attributes: ["event_type", "previous_values", "new_values", "occurred_at"],
            },
        ],
        order: getAppointmentListOrder(now),
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
    });

    const offset = total === 0 ? 0 : (currentPage - 1) * pageSize;
    return {
        appointments: appointments.map((appointment) => {
            const record = appointment.get({ plain: true });
            record.history = record.history
                .filter((event) =>
                    ["Rescheduled", "Cancelled", "Created", "NoShowMarked"].includes(
                        event.event_type,
                    ),
                )
                .sort(
                    (first, second) => new Date(first.occurred_at) - new Date(second.occurred_at),
                );
            return record;
        }),
        specialties,
        stats,
        filters,
        pagination: {
            page: currentPage,
            pageSize,
            total,
            totalPages,
            firstResult: total === 0 ? 0 : offset + 1,
            lastResult: Math.min(offset + pageSize, total),
            previousUrl: currentPage > 1 ? buildPageUrl(filters, currentPage - 1, pageSize) : null,
            nextUrl:
                currentPage < totalPages ? buildPageUrl(filters, currentPage + 1, pageSize) : null,
        },
    };
}
