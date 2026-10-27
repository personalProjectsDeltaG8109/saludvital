import { Op } from "sequelize";
import database from "../../../../config/database.js";
import {
    Appointment,
    AppointmentStatus,
    Doctor,
    DoctorScheduleException,
    User,
} from "../../../models/associations.js";
import AuditLog from "../../../models/AuditLog.js";

const BOGOTA_TIME_ZONE = "America/Bogota";
const SUPPORTED_TYPES = new Set(["Unavailable", "AdditionalAvailability"]);

function serviceError(message, statusCode = 400, details = {}) {
    return Object.assign(new Error(message), { statusCode, ...details });
}

function parsePositiveId(value, label) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) {
        throw serviceError(`Selecciona ${label} válido.`);
    }
    return id;
}

function parseLocalDateTime(value, label) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
        throw serviceError(`La fecha y hora ${label} no son válidas.`);
    }

    const [datePart, timePart] = value.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    const localDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
    const validDate =
        localDate.getUTCFullYear() === year &&
        localDate.getUTCMonth() === month - 1 &&
        localDate.getUTCDate() === day &&
        hour < 24 &&
        minute < 60;
    if (!validDate || minute % 30 !== 0) {
        throw serviceError(`La fecha y hora ${label} deben usar incrementos de 30 minutos.`);
    }

    const utcTimestamp = Date.UTC(year, month - 1, day, hour + 5, minute);
    return new Date(utcTimestamp);
}

function formatLocalDateTime(value) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: BOGOTA_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date(value));
    const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function formatException(record) {
    return {
        id: record.id,
        doctorId: record.doctor_id,
        doctorName: record.doctor?.display_name || `Médico ${record.doctor_id}`,
        startAt: record.start_at,
        endAt: record.end_at,
        startAtLocal: formatLocalDateTime(record.start_at),
        endAtLocal: formatLocalDateTime(record.end_at),
        type: record.exception_type,
        reason: record.reason,
        isActive: Boolean(record.is_active),
    };
}

function normalizeInput(input = {}) {
    const doctorId = parsePositiveId(input.doctorId, "un médico");
    if (!SUPPORTED_TYPES.has(input.type)) {
        throw serviceError("Selecciona un tipo de excepción válido.");
    }

    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (!reason || reason.length > 255) {
        throw serviceError("La descripción es obligatoria y no puede superar 255 caracteres.");
    }

    const startAt = parseLocalDateTime(input.startAt, "de inicio");
    const endAt = parseLocalDateTime(input.endAt, "de finalización");
    if (endAt <= startAt) {
        throw serviceError("La fecha y hora de finalización debe ser posterior al inicio.");
    }

    return { doctorId, type: input.type, reason, startAt, endAt };
}

async function ensureActiveDoctor(doctorId, transaction) {
    const doctor = await Doctor.findByPk(doctorId, {
        attributes: ["id"],
        include: [
            {
                model: User,
                as: "user",
                attributes: ["id", "is_active"],
                required: true,
                where: { is_active: true },
            },
        ],
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
    if (!doctor) throw serviceError("El médico seleccionado no existe o está inactivo.", 404);
    return doctor;
}

async function getAdministrator(actorId, transaction) {
    const actor = await User.findByPk(actorId, {
        attributes: ["id", "email"],
        transaction,
    });
    if (!actor) throw serviceError("No encontramos la sesión del administrador.", 401);
    return actor;
}

function getActiveWindows(records) {
    return records
        .filter((record) => record?.isActive)
        .map((record) => ({
            doctorId: record.doctorId,
            startAt: new Date(record.startAt),
            endAt: new Date(record.endAt),
        }));
}

function getWindowForInput(input) {
    return {
        doctorId: input.doctorId,
        startAt: input.startAt,
        endAt: input.endAt,
        isActive: input.isActive !== false,
    };
}

async function findAffectedAppointments(before, after, transaction) {
    const windows = getActiveWindows([before, after]);
    if (windows.length === 0) return [];

    const confirmedStatus = await AppointmentStatus.findOne({
        where: { name: "Confirmed" },
        attributes: ["id"],
        transaction,
    });
    if (!confirmedStatus) return [];

    const appointmentWindows = windows.map((window) => ({
        doctor_id: window.doctorId,
        start_at: { [Op.lt]: window.endAt },
        end_at: { [Op.gt]: window.startAt },
    }));
    const appointments = await Appointment.findAll({
        where: {
            status_id: confirmedStatus.id,
            start_at: { [Op.gt]: new Date() },
            [Op.or]: appointmentWindows,
        },
        attributes: ["id", "doctor_id", "start_at", "end_at"],
        order: [["start_at", "ASC"]],
        transaction,
        lock: transaction.LOCK.UPDATE,
    });

    const uniqueAppointments = [...new Map(appointments.map((item) => [item.id, item])).values()];
    return uniqueAppointments.map((appointment) => ({
        id: appointment.id,
        doctorId: appointment.doctor_id,
        startAt: appointment.start_at,
        endAt: appointment.end_at,
        startAtLocal: formatLocalDateTime(appointment.start_at),
        endAtLocal: formatLocalDateTime(appointment.end_at),
    }));
}

function requireImpactConfirmation(affectedAppointments, input) {
    if (affectedAppointments.length > 0 && input.confirmImpact !== true) {
        throw serviceError(
            "Revisa las citas confirmadas que coinciden con esta excepción antes de continuar.",
            409,
            { requiresConfirmation: true, affectedAppointments },
        );
    }
}

async function writeAudit(actor, action, exceptionId, before, after, reason, transaction) {
    await AuditLog.create(
        {
            actor_user_id: actor.id,
            actor_snapshot: `Administrator ${actor.email}`.slice(0, 100),
            action,
            target_type: "DoctorScheduleException",
            target_id: String(exceptionId),
            target_description: `Doctor ${after?.doctorId || before?.doctorId} schedule exception`,
            changes: { before, after },
            reason,
            result: "Success",
            occurred_at: new Date(),
        },
        { transaction },
    );
}

function auditValues(exception) {
    if (!exception) return null;
    return {
        doctorId: exception.doctorId ?? exception.doctor_id,
        startAt: new Date(exception.startAt ?? exception.start_at).toISOString(),
        endAt: new Date(exception.endAt ?? exception.end_at).toISOString(),
        type: exception.type ?? exception.exception_type,
        reason: exception.reason,
        isActive: Boolean(exception.isActive ?? exception.is_active),
    };
}

export async function getAdminDoctorScheduleExceptions(query = {}) {
    const status = query.status || "all";
    if (!["all", "active", "inactive"].includes(status)) {
        throw serviceError("El estado de las excepciones no es válido.");
    }
    const doctorId = query.doctorId ? parsePositiveId(query.doctorId, "un médico") : null;
    const where = {};
    if (status !== "all") where.is_active = status === "active";
    if (doctorId) where.doctor_id = doctorId;

    const [exceptions, doctors] = await Promise.all([
        DoctorScheduleException.findAll({
            where,
            attributes: [
                "id",
                "doctor_id",
                "start_at",
                "end_at",
                "exception_type",
                "reason",
                "is_active",
            ],
            include: [
                {
                    model: Doctor,
                    as: "doctor",
                    attributes: ["id", "display_name"],
                    required: true,
                },
            ],
            order: [
                ["start_at", "DESC"],
                ["id", "DESC"],
            ],
        }),
        Doctor.findAll({
            attributes: ["id", "display_name"],
            include: [
                {
                    model: User,
                    as: "user",
                    attributes: [],
                    required: true,
                    where: { is_active: true },
                },
            ],
            order: [["display_name", "ASC"]],
        }),
    ]);

    return {
        exceptions: exceptions.map(formatException),
        doctors: doctors.map((doctor) => ({
            id: doctor.id,
            name: doctor.display_name || `Médico ${doctor.id}`,
        })),
    };
}

export async function createAdminDoctorScheduleException(actorId, rawInput) {
    const input = normalizeInput(rawInput);
    return database.transaction(async (transaction) => {
        await ensureActiveDoctor(input.doctorId, transaction);
        const proposed = getWindowForInput(input);
        const affectedAppointments = await findAffectedAppointments(null, proposed, transaction);
        requireImpactConfirmation(affectedAppointments, rawInput || {});
        const actor = await getAdministrator(actorId, transaction);
        const record = await DoctorScheduleException.create(
            {
                doctor_id: input.doctorId,
                start_at: input.startAt,
                end_at: input.endAt,
                exception_type: input.type,
                reason: input.reason,
                created_by: actor.id,
                actor_snapshot: `Administrator ${actor.email}`.slice(0, 100),
                is_active: true,
            },
            { transaction, validate: true },
        );
        await writeAudit(
            actor,
            "AdminDoctorScheduleExceptionCreated",
            record.id,
            null,
            auditValues(record),
            "Administrator created a doctor schedule exception.",
            transaction,
        );
        return {
            exception: formatException(record),
            affectedAppointmentsReviewed: affectedAppointments.length,
            message: "La excepción de horario se creó correctamente.",
        };
    });
}

export async function updateAdminDoctorScheduleException(actorId, rawId, rawInput) {
    const exceptionId = parsePositiveId(rawId, "un intervalo de excepción");
    const input = normalizeInput(rawInput);
    return database.transaction(async (transaction) => {
        const record = await DoctorScheduleException.findByPk(exceptionId, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!record) throw serviceError("No encontramos la excepción que deseas editar.", 404);
        await ensureActiveDoctor(input.doctorId, transaction);

        const before = {
            doctorId: record.doctor_id,
            startAt: record.start_at,
            endAt: record.end_at,
            isActive: record.is_active,
        };
        const after = { ...getWindowForInput(input), isActive: record.is_active };
        const affectedAppointments = await findAffectedAppointments(before, after, transaction);
        requireImpactConfirmation(affectedAppointments, rawInput || {});
        const actor = await getAdministrator(actorId, transaction);
        const previousValues = auditValues(record);
        await record.update(
            {
                doctor_id: input.doctorId,
                start_at: input.startAt,
                end_at: input.endAt,
                exception_type: input.type,
                reason: input.reason,
            },
            { transaction, validate: true },
        );
        await writeAudit(
            actor,
            "AdminDoctorScheduleExceptionUpdated",
            record.id,
            previousValues,
            auditValues(record),
            "Administrator edited a doctor schedule exception.",
            transaction,
        );
        return {
            exception: formatException(record),
            affectedAppointmentsReviewed: affectedAppointments.length,
            message: "La excepción de horario se actualizó correctamente.",
        };
    });
}

export async function updateAdminDoctorScheduleExceptionStatus(actorId, rawId, input = {}) {
    const exceptionId = parsePositiveId(rawId, "una excepción");
    if (typeof input.isActive !== "boolean") {
        throw serviceError("El estado de la excepción no es válido.");
    }

    return database.transaction(async (transaction) => {
        const record = await DoctorScheduleException.findByPk(exceptionId, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!record) throw serviceError("No encontramos la excepción seleccionada.", 404);
        if (record.is_active === input.isActive) {
            throw serviceError("La excepción ya tiene ese estado.", 409);
        }
        if (input.isActive) await ensureActiveDoctor(record.doctor_id, transaction);

        const before = {
            doctorId: record.doctor_id,
            startAt: record.start_at,
            endAt: record.end_at,
            isActive: record.is_active,
        };
        const after = { ...before, isActive: input.isActive };
        const affectedAppointments = await findAffectedAppointments(before, after, transaction);
        requireImpactConfirmation(affectedAppointments, input);
        const actor = await getAdministrator(actorId, transaction);
        const previousValues = auditValues(record);
        await record.update({ is_active: input.isActive }, { transaction, validate: true });
        await writeAudit(
            actor,
            input.isActive
                ? "AdminDoctorScheduleExceptionReactivated"
                : "AdminDoctorScheduleExceptionDeactivated",
            record.id,
            previousValues,
            auditValues(record),
            input.isActive
                ? "Administrator reactivated a doctor schedule exception."
                : "Administrator deactivated a doctor schedule exception.",
            transaction,
        );
        return {
            exception: formatException(record),
            affectedAppointmentsReviewed: affectedAppointments.length,
            message: input.isActive
                ? "La excepción se reactivó correctamente."
                : "La excepción se desactivó correctamente.",
        };
    });
}
