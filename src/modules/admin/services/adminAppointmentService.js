import { Op } from "sequelize";
import {
    Appointment,
    AppointmentStatus,
    Doctor,
    Patient,
    Specialities,
} from "../../../models/associations.js";

const PAGE_SIZE_OPTIONS = [10, 25];
const MAX_SEARCH_LENGTH = 100;
const STATUS_LABELS = {
    Confirmed: "Confirmada",
    "In Progress": "En curso",
    Attended: "Asistida",
    Cancelled: "Cancelada",
};
const SUPPORTED_STATUSES = Object.keys(STATUS_LABELS);

function serviceError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parseInteger(value, fallback, label) {
    if (value === undefined || value === null || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        throw serviceError(`${label} tiene un valor no válido.`);
    }
    return parsed;
}

function parseDate(value, label) {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw serviceError(`${label} no es válida.`);
    }

    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw serviceError(`${label} no es válida.`);
    }
    return value;
}

function bogotaDateStart(date) {
    return new Date(`${date}T05:00:00.000Z`);
}

function nextDate(date) {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    parsed.setUTCDate(parsed.getUTCDate() + 1);
    return parsed.toISOString().slice(0, 10);
}

function buildFilters(query) {
    const where = {};
    const from = parseDate(query.from, "La fecha inicial");
    const to = parseDate(query.to, "La fecha final");
    if (from && to && from > to) {
        throw serviceError("La fecha inicial debe ser anterior a la fecha final.");
    }
    if (from || to) {
        where.start_at = {};
        if (from) where.start_at[Op.gte] = bogotaDateStart(from);
        if (to) where.start_at[Op.lt] = bogotaDateStart(nextDate(to));
    }

    if (query.specialtyId) {
        where.specialty_id = parseInteger(query.specialtyId, null, "La especialidad");
    }
    if (query.doctorId) {
        where.doctor_id = parseInteger(query.doctorId, null, "El médico");
    }

    const search = typeof query.search === "string" ? query.search.trim() : "";
    if (search.length > MAX_SEARCH_LENGTH) {
        throw serviceError("La búsqueda no puede superar los 100 caracteres.");
    }
    if (search) {
        where[Op.or] = [
            { "$patient.first_name$": { [Op.like]: `%${search}%` } },
            { "$patient.last_name$": { [Op.like]: `%${search}%` } },
            {
                [Op.and]: [
                    { "$patient.first_name$": { [Op.like]: `%${search.split(/\s+/)[0]}%` } },
                    { "$patient.last_name$": { [Op.like]: `%${search.split(/\s+/).at(-1)}%` } },
                ],
            },
            { "$patient.document_number$": { [Op.like]: `%${search}%` } },
            { "$patient.phone$": { [Op.like]: `%${search}%` } },
        ];
    }

    return { where, search };
}

function createIncludes(search) {
    return [
        {
            model: Patient,
            as: "patient",
            attributes: [
                "id",
                "first_name",
                "last_name",
                "document_type",
                "document_number",
                "profile_photo_url",
            ],
            required: Boolean(search),
        },
        {
            model: Doctor,
            as: "doctor",
            attributes: ["id", "display_name", "profile_photo_url"],
            required: true,
        },
        { model: Specialities, as: "specialty", attributes: ["id", "name"], required: true },
        { model: AppointmentStatus, as: "status", attributes: ["id", "name"], required: true },
    ];
}

function formatAppointment(appointment) {
    return {
        id: appointment.id,
        startAt: new Date(appointment.start_at).toISOString(),
        endAt: new Date(appointment.end_at).toISOString(),
        patient: {
            id: appointment.patient.id,
            name: `${appointment.patient.first_name} ${appointment.patient.last_name}`.trim(),
            document: [appointment.patient.document_type, appointment.patient.document_number]
                .filter(Boolean)
                .join(" "),
            photoUrl: appointment.patient.profile_photo_url || null,
        },
        specialty: appointment.specialty.name,
        doctor: appointment.doctor.display_name || `Médico ${appointment.doctor.id}`,
        status: appointment.status.name,
        statusLabel: STATUS_LABELS[appointment.status.name],
    };
}

/** Return a paginated, privacy-conscious appointment directory for administrators. */
export async function getAdminAppointments(query = {}) {
    const page = parseInteger(query.page, 1, "La página");
    const pageSize = parseInteger(query.pageSize, 10, "El tamaño de página");
    if (!PAGE_SIZE_OPTIONS.includes(pageSize)) {
        throw serviceError("El tamaño de página solicitado no es válido.");
    }
    const status = query.status || "all";
    if (status !== "all" && !SUPPORTED_STATUSES.includes(status)) {
        throw serviceError("El estado seleccionado no es válido.");
    }

    const { where, search } = buildFilters(query);
    const includes = createIncludes(search);
    const statusRows = await AppointmentStatus.findAll({
        where: { name: { [Op.in]: SUPPORTED_STATUSES } },
        attributes: ["id", "name"],
        order: [["id", "ASC"]],
    });
    const statusIdByName = new Map(statusRows.map((row) => [row.name, row.id]));
    const supportedStatusIds = statusRows.map((row) => row.id);
    const listWhere = { ...where, status_id: { [Op.in]: supportedStatusIds } };
    if (status !== "all") {
        const statusId = statusIdByName.get(status);
        listWhere.status_id = statusId ? statusId : { [Op.in]: [] };
    }

    const [result, statusCounts, specialties, doctors] = await Promise.all([
        Appointment.findAndCountAll({
            where: listWhere,
            attributes: [
                "id",
                "start_at",
                "end_at",
                "patient_id",
                "doctor_id",
                "specialty_id",
                "status_id",
            ],
            include: includes,
            order: [
                ["start_at", "DESC"],
                ["id", "DESC"],
            ],
            limit: pageSize,
            offset: (page - 1) * pageSize,
            distinct: true,
        }),
        Promise.all(
            statusRows.map(async (row) => ({
                status: row.name,
                count: await Appointment.count({
                    where: { ...where, status_id: row.id },
                    include: includes,
                    distinct: true,
                }),
            })),
        ),
        Specialities.findAll({ attributes: ["id", "name"], order: [["name", "ASC"]] }),
        Doctor.findAll({ attributes: ["id", "display_name"], order: [["display_name", "ASC"]] }),
    ]);

    const counts = Object.fromEntries(SUPPORTED_STATUSES.map((name) => [name, 0]));
    statusCounts.forEach((row) => {
        counts[row.status] = row.count;
    });
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

    return {
        appointments: result.rows.map(formatAppointment),
        statuses: statusRows.map((row) => ({ value: row.name, label: STATUS_LABELS[row.name] })),
        specialties: specialties.map((row) => ({ id: row.id, name: row.name })),
        doctors: doctors.map((row) => ({
            id: row.id,
            name: row.display_name || `Médico ${row.id}`,
        })),
        stats: { total, ...counts },
        pagination: {
            page,
            pageSize,
            totalItems: result.count,
            totalPages: Math.ceil(result.count / pageSize),
        },
    };
}
