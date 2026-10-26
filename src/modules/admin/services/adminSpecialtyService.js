import { Op } from "sequelize";
import database from "../../../../config/database.js";
import { Doctor, Specialities, User } from "../../../models/associations.js";
import AuditLog from "../../../models/AuditLog.js";

const PAGE_SIZE_OPTIONS = [10, 25];
const MAX_SEARCH_LENGTH = 100;

function serviceError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function validateSpecialtyInput(input = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw serviceError("Revisa los datos de la especialidad.");
    }
    if (typeof input.name !== "string") {
        throw serviceError("El nombre de la especialidad es obligatorio.");
    }

    const name = input.name.trim().replace(/\s+/g, " ");
    if (!name) throw serviceError("El nombre de la especialidad es obligatorio.");
    if (name.length > 100) {
        throw serviceError("El nombre no puede superar los 100 caracteres.");
    }

    if (
        input.description !== undefined &&
        input.description !== null &&
        typeof input.description !== "string"
    ) {
        throw serviceError("La descripción debe ser texto.");
    }

    const description = typeof input.description === "string" ? input.description.trim() : "";
    if (description.length > 255) {
        throw serviceError("La descripción no puede superar los 255 caracteres.");
    }

    return { name, description: description || null };
}

function duplicateSpecialtyError() {
    return serviceError("Ya existe una especialidad con ese nombre.", 409);
}

function parseSpecialtyId(value) {
    const specialtyId = Number(value);
    if (!Number.isSafeInteger(specialtyId) || specialtyId < 1) {
        throw serviceError("La especialidad solicitada no es válida.", 404);
    }
    return specialtyId;
}

/** Return only the existing specialty fields used by its edit form. */
export async function getAdminSpecialtyForEdit(rawSpecialtyId) {
    const specialtyId = parseSpecialtyId(rawSpecialtyId);
    const specialty = await Specialities.findByPk(specialtyId, {
        attributes: ["id", "name", "description", "is_active"],
    });

    if (!specialty) throw serviceError("No encontramos esa especialidad.", 404);

    return {
        id: specialty.id,
        name: specialty.name,
        description: specialty.description || "",
        isActive: specialty.is_active,
    };
}

/** Update specialty details and audit the changes without touching doctor relationships. */
export async function updateAdminSpecialty(actorId, rawSpecialtyId, input) {
    const specialtyId = parseSpecialtyId(rawSpecialtyId);
    const specialtyInput = validateSpecialtyInput(input);

    try {
        return await database.transaction(async (transaction) => {
            const specialty = await Specialities.findByPk(specialtyId, {
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!specialty) throw serviceError("No encontramos esa especialidad.", 404);

            const duplicate = await Specialities.findOne({
                where: { name: specialtyInput.name, id: { [Op.ne]: specialtyId } },
                attributes: ["id"],
                transaction,
            });
            if (duplicate) throw duplicateSpecialtyError();

            const actor = await User.findByPk(actorId, {
                attributes: ["id", "email"],
                transaction,
            });
            if (!actor) throw serviceError("No se encontró la sesión del administrador.", 401);

            const changes = {};
            if (specialty.name !== specialtyInput.name) {
                changes.name = { previous: specialty.name, next: specialtyInput.name };
            }
            if ((specialty.description || null) !== specialtyInput.description) {
                changes.description = {
                    previous: specialty.description || null,
                    next: specialtyInput.description,
                };
            }

            if (Object.keys(changes).length) {
                await specialty.update(specialtyInput, { transaction });
                await AuditLog.create(
                    {
                        actor_user_id: actor.id,
                        actor_snapshot: `Administrator ${actor.email}`.slice(0, 100),
                        action: "AdminSpecialtyUpdated",
                        target_type: "MedicalSpecialty",
                        target_id: String(specialty.id),
                        target_description: specialtyInput.name,
                        changes,
                        reason: "Administrator edited a medical specialty.",
                        result: "Success",
                        occurred_at: new Date(),
                    },
                    { transaction },
                );
            }

            return {
                id: specialty.id,
                name: specialtyInput.name,
                description: specialtyInput.description || "",
                isActive: specialty.is_active,
            };
        });
    } catch (error) {
        if (error.name === "SequelizeUniqueConstraintError") {
            throw duplicateSpecialtyError();
        }
        throw error;
    }
}

/** Change availability without deleting the specialty or its existing relationships. */
export async function updateAdminSpecialtyStatus(actorId, rawSpecialtyId, isActive) {
    const specialtyId = parseSpecialtyId(rawSpecialtyId);
    if (typeof isActive !== "boolean") {
        throw serviceError("El estado solicitado no es válido.");
    }

    return database.transaction(async (transaction) => {
        const specialty = await Specialities.findByPk(specialtyId, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!specialty) throw serviceError("No encontramos esa especialidad.", 404);

        const actor = await User.findByPk(actorId, {
            attributes: ["id", "email"],
            transaction,
        });
        if (!actor) throw serviceError("No se encontró la sesión del administrador.", 401);

        if (specialty.is_active === isActive) {
            throw serviceError(`La especialidad ya está ${isActive ? "activa" : "inactiva"}.`, 409);
        }

        const previousIsActive = specialty.is_active;
        await specialty.update({ is_active: isActive }, { transaction });
        await AuditLog.create(
            {
                actor_user_id: actor.id,
                actor_snapshot: `Administrator ${actor.email}`.slice(0, 100),
                action: isActive ? "AdminSpecialtyActivated" : "AdminSpecialtyDeactivated",
                target_type: "MedicalSpecialty",
                target_id: String(specialty.id),
                target_description: specialty.name,
                changes: {
                    previous: { isActive: previousIsActive },
                    next: { isActive },
                },
                reason: isActive
                    ? "Administrator reactivated a medical specialty."
                    : "Administrator deactivated a medical specialty.",
                result: "Success",
                occurred_at: new Date(),
            },
            { transaction },
        );

        return { id: specialty.id, name: specialty.name, isActive };
    });
}

/** Create a specialty using only fields supported by the existing catalog model. */
export async function createAdminSpecialty(input) {
    const specialtyInput = validateSpecialtyInput(input);
    const existingSpecialty = await Specialities.findOne({
        where: { name: specialtyInput.name },
        attributes: ["id"],
    });

    if (existingSpecialty) throw duplicateSpecialtyError();

    try {
        const specialty = await Specialities.create({
            ...specialtyInput,
            is_active: true,
        });

        return {
            id: specialty.id,
            name: specialty.name,
            description: specialty.description || "",
            isActive: specialty.is_active,
        };
    } catch (error) {
        if (error.name === "SequelizeUniqueConstraintError") {
            throw duplicateSpecialtyError();
        }
        throw error;
    }
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
