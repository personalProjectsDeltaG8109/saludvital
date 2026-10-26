import { Op } from "sequelize";
import { Doctor, Specialities } from "../../../models/associations.js";

const PAGE_SIZE_OPTIONS = [10, 25];
const MAX_SEARCH_LENGTH = 100;

function serviceError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parsePage(value) {
    if (value === undefined || value === null || value === "") return 1;
    const page = Number(value);
    if (!Number.isSafeInteger(page) || page < 1) {
        throw serviceError("La página solicitada no es válida.");
    }
    return page;
}

function parsePageSize(value) {
    if (value === undefined || value === null || value === "") return PAGE_SIZE_OPTIONS[0];
    const requestedPageSize = Number(value);
    if (!PAGE_SIZE_OPTIONS.includes(requestedPageSize)) {
        throw serviceError("El tamaño de página solicitado no es válido.");
    }
    return requestedPageSize;
}

function buildWhere(query) {
    const where = {};
    const search = typeof query.search === "string" ? query.search.trim() : "";

    if (search.length > MAX_SEARCH_LENGTH) {
        throw serviceError("La búsqueda no puede superar los 100 caracteres.");
    }
    if (search) where.name = { [Op.like]: `%${search}%` };

    if (query.status === "active") where.is_active = true;
    if (query.status === "inactive") where.is_active = false;
    if (query.status && !["active", "inactive", "all"].includes(query.status)) {
        throw serviceError("El estado seleccionado no es válido.");
    }

    return where;
}

/** Return the specialty catalog, live summary counts, and current doctor assignments. */
export async function getAdminSpecialties(query = {}) {
    const page = parsePage(query.page);
    const pageSize = parsePageSize(query.pageSize);
    const where = buildWhere(query);

    const [specialtiesResult, total, active, assignedDoctors, doctorCounts] = await Promise.all([
        Specialities.findAndCountAll({
            where,
            attributes: ["id", "name", "description", "is_active"],
            order: [["name", "ASC"]],
            limit: pageSize,
            offset: (page - 1) * pageSize,
        }),
        Specialities.count(),
        Specialities.count({ where: { is_active: true } }),
        Doctor.count(),
        Doctor.count({ group: ["specialty_id"] }),
    ]);

    const doctorCountBySpecialty = new Map(
        doctorCounts.map((item) => [Number(item.specialty_id), Number(item.count)]),
    );

    return {
        specialties: specialtiesResult.rows.map((specialty) => ({
            id: specialty.id,
            name: specialty.name,
            description: specialty.description || "",
            isActive: specialty.is_active,
            doctorCount: doctorCountBySpecialty.get(Number(specialty.id)) || 0,
        })),
        stats: {
            total,
            active,
            inactive: total - active,
            assignedDoctors,
        },
        pagination: {
            page,
            pageSize,
            totalItems: specialtiesResult.count,
            totalPages: Math.ceil(specialtiesResult.count / pageSize),
        },
    };
}
