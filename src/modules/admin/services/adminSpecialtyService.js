import { Op } from "sequelize";
import database from "../../../../config/database.js";
import { Doctor, Specialities, User } from "../../../models/associations.js";
import AuditLog from "../../../models/AuditLog.js";
import { removeSpecialtyLogo, storeSpecialtyLogo } from "./specialtyLogoStorageService.js";

const PAGE_SIZE_OPTIONS = [10, 25];
const MAX_SEARCH_LENGTH = 100;
const SPECIALTY_LOGO_URL_PATTERN = /^\/uploads\/specialty-logos\/[a-f0-9-]{36}\.webp$/i;

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

    if (
        input.logoDataUrl !== undefined &&
        input.logoDataUrl !== null &&
        typeof input.logoDataUrl !== "string"
    ) {
        throw serviceError("Selecciona una imagen válida para el logo.");
    }

    const removeLogo = input.removeLogo === undefined ? false : input.removeLogo;
    if (typeof removeLogo !== "boolean") {
        throw serviceError("La opción para quitar el logo no es válida.");
    }

    const logoDataUrl = typeof input.logoDataUrl === "string" ? input.logoDataUrl : null;
    if (removeLogo && logoDataUrl) {
        throw serviceError("Elige una imagen nueva o quita el logo actual, no ambas opciones.");
    }

    return { name, description: description || null, logoDataUrl, removeLogo };
}

function normalizeSpecialtyLogoUrl(value) {
    return typeof value === "string" && SPECIALTY_LOGO_URL_PATTERN.test(value) ? value : null;
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
        attributes: ["id", "name", "description", "logo_url", "is_active"],
    });

    if (!specialty) throw serviceError("No encontramos esa especialidad.", 404);

    return {
        id: specialty.id,
        name: specialty.name,
        description: specialty.description || "",
        logoUrl: normalizeSpecialtyLogoUrl(specialty.logo_url),
        isActive: specialty.is_active,
    };
}

/** Update specialty details and audit the changes without touching doctor relationships. */
export async function updateAdminSpecialty(actorId, rawSpecialtyId, input) {
    const specialtyId = parseSpecialtyId(rawSpecialtyId);
    const specialtyInput = validateSpecialtyInput(input);

    let storedLogoUrl = null;
    let previousLogoUrl = null;
    try {
        const updatedSpecialty = await database.transaction(async (transaction) => {
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
            const fieldsToUpdate = {};
            if (specialty.name !== specialtyInput.name) {
                changes.name = { previous: specialty.name, next: specialtyInput.name };
                fieldsToUpdate.name = specialtyInput.name;
            }
            if ((specialty.description || null) !== specialtyInput.description) {
                changes.description = {
                    previous: specialty.description || null,
                    next: specialtyInput.description,
                };
                fieldsToUpdate.description = specialtyInput.description;
            }
            if (specialtyInput.logoDataUrl) {
                storedLogoUrl = await storeSpecialtyLogo(specialtyInput.logoDataUrl);
                previousLogoUrl = normalizeSpecialtyLogoUrl(specialty.logo_url);
                fieldsToUpdate.logo_url = storedLogoUrl;
                changes.logo = { previous: previousLogoUrl, next: storedLogoUrl };
            } else if (specialtyInput.removeLogo && specialty.logo_url) {
                previousLogoUrl = normalizeSpecialtyLogoUrl(specialty.logo_url);
                fieldsToUpdate.logo_url = null;
                changes.logo = { previous: previousLogoUrl, next: null };
            }

            if (Object.keys(changes).length) {
                await specialty.update(fieldsToUpdate, { transaction });
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
                logoUrl: normalizeSpecialtyLogoUrl(
                    Object.hasOwn(fieldsToUpdate, "logo_url")
                        ? fieldsToUpdate.logo_url
                        : specialty.logo_url,
                ),
                isActive: specialty.is_active,
            };
        });

        if (previousLogoUrl && previousLogoUrl !== updatedSpecialty.logoUrl) {
            await removeSpecialtyLogo(previousLogoUrl).catch(() => {});
        }
        return updatedSpecialty;
    } catch (error) {
        if (storedLogoUrl) await removeSpecialtyLogo(storedLogoUrl).catch(() => {});
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

/** Create a specialty and persist its audit event in the same transaction. */
export async function createAdminSpecialty(actorId, input) {
    const specialtyInput = validateSpecialtyInput(input);
    if (!actorId) throw serviceError("No se encontró la sesión del administrador.", 401);

    let storedLogoUrl = null;
    try {
        return await database.transaction(async (transaction) => {
            const existingSpecialty = await Specialities.findOne({
                where: { name: specialtyInput.name },
                attributes: ["id"],
                transaction,
            });
            if (existingSpecialty) throw duplicateSpecialtyError();

            const actor = await User.findByPk(actorId, {
                attributes: ["id"],
                transaction,
            });
            if (!actor) throw serviceError("No se encontró la sesión del administrador.", 401);

            storedLogoUrl = specialtyInput.logoDataUrl
                ? await storeSpecialtyLogo(specialtyInput.logoDataUrl)
                : null;
            const specialty = await Specialities.create(
                {
                    name: specialtyInput.name,
                    description: specialtyInput.description,
                    logo_url: storedLogoUrl,
                    is_active: true,
                },
                { transaction },
            );
            await AuditLog.create(
                {
                    actor_user_id: actor.id,
                    actor_snapshot: `Administrator ${actor.id}`,
                    action: "AdminSpecialtyCreated",
                    target_type: "MedicalSpecialty",
                    target_id: String(specialty.id),
                    target_description: specialty.name,
                    changes: {
                        next: { name: specialty.name, hasCustomLogo: Boolean(storedLogoUrl) },
                    },
                    reason: "Administrator created a medical specialty.",
                    result: "Success",
                    occurred_at: new Date(),
                },
                { transaction },
            );

            return {
                id: specialty.id,
                name: specialty.name,
                description: specialty.description || "",
                logoUrl: storedLogoUrl,
                isActive: specialty.is_active,
            };
        });
    } catch (error) {
        if (storedLogoUrl) await removeSpecialtyLogo(storedLogoUrl).catch(() => {});
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
            attributes: ["id", "name", "description", "logo_url", "is_active"],
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
            logoUrl: normalizeSpecialtyLogoUrl(specialty.logo_url),
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
