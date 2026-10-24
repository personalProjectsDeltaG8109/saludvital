import { Op } from "sequelize";
import database from "../../../../config/database.js";
import AuditLog from "../../../models/AuditLog.js";
import { Doctor, Patient, Rol, User } from "../../../models/associations.js";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const ADMIN_ROLE_NAME = "Administrator";

function serviceError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parsePositiveInteger(value, label, defaultValue) {
    if (value === undefined || value === null || value === "") return defaultValue;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        throw serviceError(`${label} no es válido.`, 400);
    }
    return parsed;
}

function normalizeListFilters(query = {}) {
    const page = parsePositiveInteger(query.page, "La página", 1);
    const requestedPageSize = parsePositiveInteger(
        query.pageSize,
        "El tamaño de página",
        DEFAULT_PAGE_SIZE,
    );
    if (requestedPageSize > MAX_PAGE_SIZE) {
        throw serviceError(`El tamaño de página no puede superar ${MAX_PAGE_SIZE}.`, 400);
    }

    const search = query.search === undefined ? "" : query.search;
    if (typeof search !== "string" || search.trim().length > 100) {
        throw serviceError("El texto de búsqueda no es válido.", 400);
    }

    const roleId = parsePositiveInteger(query.roleId, "El rol", null);
    if (query.status && !["active", "inactive"].includes(query.status)) {
        throw serviceError("El estado de cuenta no es válido.", 400);
    }

    return {
        page,
        pageSize: requestedPageSize,
        search: search.trim(),
        roleId,
        status: query.status,
    };
}

function userIncludes() {
    return [
        { model: Rol, as: "rol", attributes: ["id", "name"], required: true },
        { model: Patient, as: "patient", attributes: ["first_name", "last_name"], required: false },
        { model: Doctor, as: "doctor", attributes: ["display_name"], required: false },
    ];
}

function toUserSummary(record) {
    const patientName = [record.patient?.first_name, record.patient?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
    const displayName = record.doctor?.display_name?.trim() || patientName || record.email;
    const profileType = record.doctor
        ? "Médico"
        : record.patient
          ? "Paciente"
          : record.rol?.name === ADMIN_ROLE_NAME
            ? "Administrador"
            : "Sin perfil";

    return {
        id: record.id,
        displayName,
        email: record.email,
        role: record.rol,
        isActive: record.is_active,
        profileType,
        createdAt: record.created_at,
        lastLoginAt: record.last_login_at,
    };
}

/** Return bounded account summaries and the existing role catalog for administrators. */
export async function getAdminUsers(query = {}) {
    const filters = normalizeListFilters(query);
    const where = {};
    if (filters.roleId) {
        const roleExists = await Rol.count({ where: { id: filters.roleId } });
        if (!roleExists) throw serviceError("El rol seleccionado no existe.", 400);
        where.role_id = filters.roleId;
    }
    if (filters.status) where.is_active = filters.status === "active";
    if (filters.search) {
        const term = `%${filters.search.replace(/[\\%_]/g, "\\$&")}%`;
        where[Op.or] = [
            { email: { [Op.like]: term } },
            { "$patient.first_name$": { [Op.like]: term } },
            { "$patient.last_name$": { [Op.like]: term } },
            { "$doctor.display_name$": { [Op.like]: term } },
        ];
    }

    const [result, roles] = await Promise.all([
        User.findAndCountAll({
            where,
            attributes: ["id", "email", "role_id", "is_active", "created_at", "last_login_at"],
            include: userIncludes(),
            order: [
                ["created_at", "DESC"],
                ["id", "DESC"],
            ],
            limit: filters.pageSize,
            offset: (filters.page - 1) * filters.pageSize,
            distinct: true,
            subQuery: false,
        }),
        Rol.findAll({ attributes: ["id", "name", "description"], order: [["name", "ASC"]] }),
    ]);

    return {
        users: result.rows.map(toUserSummary),
        roles,
        pagination: {
            page: filters.page,
            pageSize: filters.pageSize,
            totalItems: result.count,
            totalPages: Math.ceil(result.count / filters.pageSize),
        },
    };
}

function normalizeUserUpdate(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw serviceError("Los cambios de la cuenta no son válidos.", 400);
    }
    const allowedFields = new Set(["roleId", "isActive"]);
    if (
        !Object.keys(payload).length ||
        Object.keys(payload).some((key) => !allowedFields.has(key))
    ) {
        throw serviceError("Selecciona un cambio de rol o estado válido.", 400);
    }

    const changes = {};
    if (Object.hasOwn(payload, "roleId")) {
        changes.roleId = parsePositiveInteger(payload.roleId, "El rol", null);
    }
    if (Object.hasOwn(payload, "isActive")) {
        if (typeof payload.isActive !== "boolean") {
            throw serviceError("El estado de cuenta no es válido.", 400);
        }
        changes.isActive = payload.isActive;
    }
    return changes;
}

/** Apply role/status changes while protecting administrator access and recording an audit event. */
export async function updateAdminUser(actorUserId, rawUserId, payload) {
    const userId = parsePositiveInteger(rawUserId, "El usuario", null);
    const actorId = parsePositiveInteger(actorUserId, "El administrador", null);
    const changes = normalizeUserUpdate(payload);

    return database.transaction(async (transaction) => {
        // Serialize account updates around the administrator role to prevent lockout races.
        const administratorRole = await Rol.findOne({
            where: { name: ADMIN_ROLE_NAME },
            attributes: ["id"],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!administratorRole) throw serviceError("No se encontró el rol de administrador.", 500);

        const user = await User.findByPk(userId, {
            attributes: ["id", "email", "role_id", "is_active"],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!user) throw serviceError("No encontramos esa cuenta de usuario.", 404);

        const nextRoleId = changes.roleId ?? user.role_id;
        const nextIsActive = changes.isActive ?? user.is_active;
        const nextRole = await Rol.findByPk(nextRoleId, {
            attributes: ["id", "name"],
            transaction,
        });
        if (!nextRole) throw serviceError("El rol seleccionado no existe.", 400);

        const removesAdministratorAccess =
            user.role_id === administratorRole.id &&
            (!nextIsActive || nextRoleId !== administratorRole.id);
        if (userId === actorId && removesAdministratorAccess) {
            throw serviceError("No puedes quitarte tu propio acceso de administrador.", 409);
        }

        if (removesAdministratorAccess) {
            const activeAdministrators = await User.findAll({
                where: { role_id: administratorRole.id, is_active: true },
                attributes: ["id"],
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (activeAdministrators.length <= 1) {
                throw serviceError(
                    "No puedes desactivar o cambiar el rol del último administrador activo.",
                    409,
                );
            }
        }

        const previousValues = { roleId: user.role_id, isActive: user.is_active };
        const newValues = { roleId: nextRoleId, isActive: nextIsActive };
        if (
            previousValues.roleId === newValues.roleId &&
            previousValues.isActive === newValues.isActive
        ) {
            throw serviceError("La cuenta ya tiene el rol y estado seleccionados.", 409);
        }

        const actor = await User.findByPk(actorId, {
            attributes: ["id", "email"],
            transaction,
        });
        if (!actor) throw serviceError("No se encontró la sesión del administrador.", 401);

        await user.update({ role_id: nextRoleId, is_active: nextIsActive }, { transaction });
        await AuditLog.create(
            {
                actor_user_id: actorId,
                actor_snapshot: `Administrator ${actor.email}`.slice(0, 100),
                action: "AdminUserAccountUpdated",
                target_type: "User",
                target_id: String(user.id),
                target_description: user.email,
                changes: {
                    previous: previousValues,
                    next: newValues,
                },
                reason: "Administrator updated a user role or account status.",
                result: "Success",
                occurred_at: new Date(),
            },
            { transaction },
        );

        return {
            message: "Los cambios de la cuenta se guardaron correctamente.",
            user: {
                id: user.id,
                email: user.email,
                role: nextRole,
                isActive: nextIsActive,
            },
        };
    });
}
