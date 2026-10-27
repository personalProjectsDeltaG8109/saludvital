import { Op } from "sequelize";
import { Appointment } from "../../../models/associations.js";
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

const CHANGE_LABELS = {
    cancelledAppointmentCount: "Citas canceladas",
    cancellationCause: "Motivo de cancelación",
    dayOfWeek: "Día de la semana",
    doctorId: "Identificador del médico",
    endAt: "Fecha y hora de finalización",
    endTime: "Hora de finalización",
    isActive: "Estado activo",
    next: "Nuevo valor",
    previous: "Valor anterior",
    roleId: "Identificador del rol",
    startAt: "Fecha y hora de inicio",
    startTime: "Hora de inicio",
    specialtyId: "Identificador de especialidad",
    startDate: "Fecha inicial",
    status: "Estado",
    type: "Tipo",
    validFrom: "Vigente desde",
    validUntil: "Vigente hasta",
};

const SAFE_CHANGE_KEYS = new Set(Object.keys(CHANGE_LABELS));
const WEEKDAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

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

function parsePage(value) {
    if (value === undefined || value === "") return 1;
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
        throw createAuditError("La página solicitada no es válida.");
    }

    const page = Number(value);
    if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        page > Math.floor(Number.MAX_SAFE_INTEGER / PAGE_SIZE)
    ) {
        throw createAuditError("La página solicitada no es válida.");
    }

    return page;
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
    const targetId = getSafeTargetId(record.target_id);
    if (!targetId) return `${description}.`;

    if (record.target_type === "Appointment") {
        return `${description} #${targetId}.`;
    }

    if (record.target_type === "User") {
        return `${description} #${targetId}.`;
    }

    return `${description} (registro #${targetId}).`;
}

function getSafeTargetId(value) {
    if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? String(id) : null;
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

function parseAuditId(value) {
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
        throw createAuditError("El identificador del evento no es válido.");
    }

    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) {
        throw createAuditError("El identificador del evento no es válido.");
    }

    return id;
}

function formatChangeValue(key, value) {
    if (key === "dayOfWeek") {
        return Number.isInteger(value) && value >= 1 && value <= 7
            ? WEEKDAY_LABELS[value - 1]
            : null;
    }
    if (typeof value === "boolean") return value ? "Sí" : "No";
    if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
    if (typeof value !== "string") return null;

    if (key === "status") {
        return { Confirmed: "Confirmada", Cancelled: "Cancelada" }[value] || null;
    }
    if (key === "cancellationCause") {
        return (
            {
                AdditionalAvailabilityDeactivated: "Se desactivó la disponibilidad adicional",
            }[value] || null
        );
    }
    if (key === "type") {
        return (
            {
                Unavailable: "No disponible",
                AdditionalAvailability: "Disponibilidad adicional",
            }[value] || null
        );
    }
    if (["startTime", "endTime"].includes(key)) {
        return /^\d{2}:\d{2}(?::\d{2})?$/.test(value) ? value.slice(0, 5) : null;
    }
    if (["startAt", "endAt", "validFrom", "validUntil", "startDate"].includes(key)) {
        if (
            ["validFrom", "validUntil", "startDate"].includes(key) &&
            /^\d{4}-\d{2}-\d{2}$/.test(value)
        ) {
            const date = new Date(`${value}T00:00:00.000Z`);
            return date.toISOString().slice(0, 10) === value ? value : null;
        }
        if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value)) {
            return null;
        }
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    return null;
}

function formatChangeGroup(values) {
    if (!values || typeof values !== "object" || Array.isArray(values)) return [];

    return Object.entries(values).flatMap(([key, value]) => {
        if (!SAFE_CHANGE_KEYS.has(key)) return [];
        const formattedValue = formatChangeValue(key, value);
        if (formattedValue === null) return [];
        return [{ label: CHANGE_LABELS[key], value: formattedValue }];
    });
}

function getSafeChanges(changes) {
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) return null;

    const before = formatChangeGroup(changes.before ?? changes.previous);
    const after = formatChangeGroup(changes.after ?? changes.next);
    const recorded = formatChangeGroup(
        Object.fromEntries(
            Object.entries(changes).filter(
                ([key]) => !["before", "after", "previous", "next", "added"].includes(key),
            ),
        ),
    );

    if (!before.length && !after.length && !recorded.length) return null;
    return { before, after, recorded };
}

/** Return one persisted audit event with a strict allowlist for change values. */
export async function getAdminAuditEvent(rawId) {
    const id = parseAuditId(rawId);
    const record = await AuditLog.findByPk(id, {
        attributes: [
            "id",
            "actor_user_id",
            "actor_snapshot",
            "action",
            "target_type",
            "target_id",
            "changes",
            "result",
            "occurred_at",
        ],
    });

    if (!record) {
        const error = new Error("No encontramos el evento de auditoría solicitado.");
        error.statusCode = 404;
        throw error;
    }

    const summary = formatAuditRecord(record);
    const isAdditionalAvailabilityCancellation =
        record.action === "AdminAppointmentCancelled" &&
        record.changes?.cancellationCause === "AdditionalAvailabilityDeactivated";
    if (isAdditionalAvailabilityCancellation) {
        const targetId = getSafeTargetId(record.target_id);
        const appointment = targetId
            ? await Appointment.findByPk(Number(targetId), {
                  attributes: ["id"],
                  include: [
                      {
                          association: "patient",
                          attributes: ["first_name", "last_name"],
                          required: false,
                      },
                  ],
              })
            : null;
        const patientName = [appointment?.patient?.first_name, appointment?.patient?.last_name]
            .filter(Boolean)
            .join(" ")
            .trim();
        const patientDescription = patientName ? ` del paciente ${patientName}` : "";
        const appointmentReference = targetId ? ` #${targetId}` : "";
        summary.description = `La cita${appointmentReference}${patientDescription} se canceló porque el administrador #${record.actor_user_id} desactivó la disponibilidad adicional.`;
    }
    return {
        ...summary,
        targetType: MODULE_LABELS[record.target_type] || "Otros",
        targetId: getSafeTargetId(record.target_id),
        result: { Success: "Correcto", Failure: "Fallido" }[record.result] || null,
        changes: getSafeChanges(record.changes),
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
    const page = parsePage(query.page);
    const filters = await getFilterOptions();

    if (action && !filters.actions.some((option) => option.value === action)) {
        throw createAuditError("La acción seleccionada no es válida.");
    }
    if (module && !filters.modules.some((option) => option.value === module)) {
        throw createAuditError("El módulo seleccionado no es válido.");
    }

    const where = {};
    if (action) where.action = action;
    if (module) where.target_type = module;

    if (startDate || endDate) {
        where.occurred_at = {};
        if (startDate) where.occurred_at[Op.gte] = getBogotaBoundary(startDate);
        if (endDate) where.occurred_at[Op.lt] = getBogotaBoundary(endDate, true);
    }

    const findPage = (requestedPage) =>
        AuditLog.findAndCountAll({
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
            offset: (requestedPage - 1) * PAGE_SIZE,
        });

    let currentPage = page;
    let result = await findPage(currentPage);
    const totalItems = Number(result.count);
    const totalPages = Math.ceil(totalItems / PAGE_SIZE);

    if (totalPages === 0) {
        currentPage = 1;
    } else if (currentPage > totalPages) {
        currentPage = totalPages;
        result = await findPage(currentPage);
    }

    return {
        records: result.rows.map(formatAuditRecord),
        totalItems,
        filters,
        pagination: {
            page: currentPage,
            pageSize: PAGE_SIZE,
            totalItems,
            totalPages,
        },
    };
}
