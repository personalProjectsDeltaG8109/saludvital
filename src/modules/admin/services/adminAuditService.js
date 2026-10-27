import { Op } from "sequelize";
import AuditLog from "../../../models/AuditLog.js";

const PAGE_SIZE = 10;
const BOGOTA_OFFSET_HOURS = 5;

const MODULE_LABELS = {
    Appointment: "Citas médicas",
    Doctor: "Médicos",
    DoctorAvailability: "Horarios",
    DoctorScheduleException: "Horarios",
    MedicalSpecialty: "Especialidades",
    User: "Usuarios y roles",
};

const ACTION_LABELS = {
    AdminAppointmentCancelled: "Cancelación de cita",
    AdminDoctorActivated: "Activación de médico",
    AdminDoctorCreated: "Registro de médico",
    AdminDoctorDeactivated: "Desactivación de médico",
    AdminDoctorScheduleDeleted: "Retiro de intervalo",
    AdminDoctorScheduleExceptionActivated: "Activación de excepción",
    AdminDoctorScheduleExceptionCreated: "Creación de excepción",
    AdminDoctorScheduleExceptionDeactivated: "Desactivación de excepción",
    AdminDoctorScheduleExceptionUpdated: "Actualización de excepción",
    AdminDoctorScheduleUpdated: "Actualización de horario",
    AdminSpecialtyActivated: "Activación de especialidad",
    AdminSpecialtyDeactivated: "Desactivación de especialidad",
    AdminSpecialtyUpdated: "Actualización de especialidad",
    AdminUserAccountUpdated: "Actualización de cuenta",
    AdminUserProfileUpdated: "Actualización de perfil",
};

const EVENT_DESCRIPTIONS = {
    AdminAppointmentCancelled: "Se canceló una cita",
    AdminDoctorActivated: "Se activó un médico",
    AdminDoctorCreated: "Se registró un médico",
    AdminDoctorDeactivated: "Se desactivó un médico",
    AdminDoctorScheduleDeleted: "Se retiró un intervalo de horario",
    AdminDoctorScheduleExceptionActivated: "Se activó una excepción de horario",
    AdminDoctorScheduleExceptionCreated: "Se creó una excepción de horario",
    AdminDoctorScheduleExceptionDeactivated: "Se desactivó una excepción de horario",
    AdminDoctorScheduleExceptionUpdated: "Se actualizó una excepción de horario",
    AdminDoctorScheduleUpdated: "Se actualizó un horario médico",
    AdminSpecialtyActivated: "Se activó una especialidad",
    AdminSpecialtyDeactivated: "Se desactivó una especialidad",
    AdminSpecialtyUpdated: "Se actualizó una especialidad",
    AdminUserAccountUpdated: "Se actualizaron los permisos o el estado de una cuenta",
    AdminUserProfileUpdated: "Se actualizó un perfil de usuario",
};

function createAuditError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

function parseDateFilter(value, label) {
    if (value === undefined || value === "") return null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw createAuditError(`${label} no es válida.`);
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw createAuditError(`${label} no es válida.`);
    }

    return value;
}

function getBogotaBoundary(date, nextDay = false) {
    const utcDate = new Date(`${date}T00:00:00.000Z`);
    if (nextDay) utcDate.setUTCDate(utcDate.getUTCDate() + 1);
    utcDate.setUTCHours(BOGOTA_OFFSET_HOURS);
    return utcDate;
}

function parseTextFilter(value, label) {
    if (value === undefined || value === "") return null;
    if (typeof value !== "string" || value.trim().length > 60) {
        throw createAuditError(`${label} no es válido.`);
    }
    return value.trim();
}

function getActorLabel(record) {
    if (!record.actor_user_id) return "Sistema";

    const actorType = record.actor_snapshot?.split(" ")[0];
    const actorLabels = {
        Administrator: "Administrador",
        Doctor: "Médico",
        Patient: "Paciente",
        System: "Sistema",
    };
    const label = actorLabels[actorType] || "Usuario";
    return `${label} #${record.actor_user_id}`;
}

function getSafeDescription(record) {
    const description = EVENT_DESCRIPTIONS[record.action] || "Se registró una acción del sistema";
    if (!record.target_id) return `${description}.`;

    if (record.target_type === "Appointment") {
        return `${description} #${record.target_id}.`;
    }

    if (record.target_type === "User") {
        return `${description} #${record.target_id}.`;
    }

    return `${description} (registro #${record.target_id}).`;
}

function formatAuditRecord(record) {
    return {
        id: record.id,
        occurredAt: record.occurred_at,
        actor: getActorLabel(record),
        module: MODULE_LABELS[record.target_type] || "Otros",
        action: ACTION_LABELS[record.action] || "Actividad",
        description: getSafeDescription(record),
    };
}

async function getFilterOptions() {
    const [actions, modules] = await Promise.all([
        AuditLog.findAll({ attributes: ["action"], group: ["action"], raw: true }),
        AuditLog.findAll({ attributes: ["target_type"], group: ["target_type"], raw: true }),
    ]);

    return {
        actions: actions.map(({ action }) => ({
            value: action,
            label: ACTION_LABELS[action] || "Actividad",
        })),
        modules: modules.map(({ target_type: targetType }) => ({
            value: targetType,
            label: MODULE_LABELS[targetType] || "Otros",
        })),
    };
}

/** Return recent audit records and safe filter options for the administrator page. */
export async function getAdminAuditLogs(query = {}) {
    const startDate = parseDateFilter(query.startDate, "La fecha inicial");
    const endDate = parseDateFilter(query.endDate, "La fecha final");
    if (startDate && endDate && startDate > endDate) {
        throw createAuditError("La fecha inicial no puede ser posterior a la fecha final.");
    }

    const action = parseTextFilter(query.action, "La acción");
    const module = parseTextFilter(query.module, "El módulo");
    const where = {};
    if (action) where.action = action;
    if (module) where.target_type = module;

    if (startDate || endDate) {
        where.occurred_at = {};
        if (startDate) where.occurred_at[Op.gte] = getBogotaBoundary(startDate);
        if (endDate) where.occurred_at[Op.lt] = getBogotaBoundary(endDate, true);
    }

    const [records, totalItems, filters] = await Promise.all([
        AuditLog.findAll({
            attributes: [
                "id",
                "actor_user_id",
                "actor_snapshot",
                "action",
                "target_type",
                "target_id",
                "occurred_at",
            ],
            where,
            order: [
                ["occurred_at", "DESC"],
                ["id", "DESC"],
            ],
            limit: PAGE_SIZE,
        }),
        AuditLog.count({ where }),
        getFilterOptions(),
    ]);

    return {
        records: records.map(formatAuditRecord),
        totalItems,
        filters,
    };
}
