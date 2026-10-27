import { Op } from "sequelize";
import database from "../../../../config/database.js";
import {
    Appointment,
    AppointmentHistory,
    AppointmentStatus,
    Doctor,
    DoctorAvailability,
    DoctorScheduleException,
    User,
} from "../../../models/associations.js";
import AuditLog from "../../../models/AuditLog.js";
import {
    cancelPendingAppointmentReminders,
    enqueueAppointmentNotifications,
} from "../../patient/services/notificationAutomationService.js";

const BOGOTA_TIME_ZONE = "America/Bogota";
const BUSINESS_START = "07:00";
const BUSINESS_END = "19:00";
const APPOINTMENT_MINUTES = 30;
const WEEKDAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function serviceError(message, statusCode = 400, details = {}) {
    return Object.assign(new Error(message), { statusCode, ...details });
}

function parseDoctorId(value) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) {
        throw serviceError("Selecciona un médico válido.");
    }
    return id;
}

function parseDate(value, label, required = false) {
    if ((!value || value === "") && !required) return null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw serviceError(`La fecha ${label} no es válida.`);
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw serviceError(`La fecha ${label} no es válida.`);
    }
    return value;
}

function parseTime(value, label) {
    if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
        throw serviceError(`La hora ${label} no es válida.`);
    }
    return value;
}

function minutesSinceMidnight(value) {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
}

export function normalizeDoctorSchedule(input) {
    const doctorId = parseDoctorId(input?.doctorId);
    const validFrom = parseDate(input?.validFrom, "de inicio", true);
    const validUntil = parseDate(input?.validUntil, "de finalización");
    if (validUntil && validUntil < validFrom) {
        throw serviceError(
            "La fecha de finalización debe ser igual o posterior a la fecha de inicio.",
        );
    }
    if (!Array.isArray(input?.blocks) || input.blocks.length === 0 || input.blocks.length > 35) {
        throw serviceError("Agrega al menos un intervalo de atención válido.");
    }

    const blocks = input.blocks.map((block) => {
        const dayOfWeek = Number(block?.dayOfWeek);
        if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
            throw serviceError("Selecciona un día de atención válido.");
        }
        const startTime = parseTime(block?.startTime, "de inicio");
        const endTime = parseTime(block?.endTime, "de finalización");
        const startMinutes = minutesSinceMidnight(startTime);
        const endMinutes = minutesSinceMidnight(endTime);
        const duration = endMinutes - startMinutes;
        if (
            startTime < BUSINESS_START ||
            endTime > BUSINESS_END ||
            duration < APPOINTMENT_MINUTES ||
            startMinutes % APPOINTMENT_MINUTES !== 0 ||
            endMinutes % APPOINTMENT_MINUTES !== 0
        ) {
            throw serviceError(
                "Los horarios deben estar entre 7:00 a. m. y 7:00 p. m. y alinearse con intervalos de 30 minutos.",
            );
        }
        return { dayOfWeek, startTime, endTime };
    });

    for (let index = 0; index < blocks.length; index += 1) {
        for (let otherIndex = index + 1; otherIndex < blocks.length; otherIndex += 1) {
            const first = blocks[index];
            const second = blocks[otherIndex];
            if (
                first.dayOfWeek === second.dayOfWeek &&
                first.startTime < second.endTime &&
                first.endTime > second.startTime
            ) {
                throw serviceError("Hay intervalos superpuestos en el mismo día.");
            }
        }
    }

    return { doctorId, validFrom, validUntil, blocks };
}

function validityOverlaps(first, second) {
    const firstEnd = first.validUntil || "9999-12-31";
    const secondEnd = second.valid_until ? String(second.valid_until).slice(0, 10) : "9999-12-31";
    const secondStart = String(second.valid_from).slice(0, 10);
    return first.validFrom <= secondEnd && secondStart <= firstEnd;
}

function hasTimeOverlap(first, second) {
    return (
        first.startTime < String(second.end_time).slice(0, 5) &&
        first.endTime > String(second.start_time).slice(0, 5)
    );
}

function validateExistingOverlaps(schedule, existingBlocks) {
    const overlap = schedule.blocks.some((block) =>
        existingBlocks.some(
            (existing) =>
                existing.day_of_week === block.dayOfWeek &&
                validityOverlaps(schedule, existing) &&
                hasTimeOverlap(block, existing),
        ),
    );
    if (overlap) {
        throw serviceError("El horario se superpone con otro intervalo vigente de este médico.");
    }
}

function getBogotaDateTime(value) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: BOGOTA_TIME_ZONE,
        weekday: "short",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date(value));
    const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
    return {
        date: `${values.year}-${values.month}-${values.day}`,
        weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(values.weekday) + 1,
        time: `${values.hour}:${values.minute}`,
    };
}

function scheduleCovers(appointment, blocks) {
    const start = getBogotaDateTime(appointment.start_at);
    const end = getBogotaDateTime(appointment.end_at);
    if (start.date !== end.date) return false;
    return blocks.some((block) => {
        const validFrom = block.validFrom || String(block.valid_from).slice(0, 10);
        const validUntil = block.validUntil ?? block.valid_until;
        return (
            (block.dayOfWeek === start.weekday || block.day_of_week === start.weekday) &&
            validFrom <= start.date &&
            (!validUntil || String(validUntil).slice(0, 10) >= start.date) &&
            (block.startTime || String(block.start_time).slice(0, 5)) <= start.time &&
            (block.endTime || String(block.end_time).slice(0, 5)) >= end.time
        );
    });
}

function overlapsException(appointment, exceptions) {
    return exceptions.some(
        (exception) =>
            new Date(exception.start_at) < new Date(appointment.end_at) &&
            new Date(exception.end_at) > new Date(appointment.start_at),
    );
}

function formatImpactAppointment(appointment, exceptions) {
    const localStart = getBogotaDateTime(appointment.start_at);
    const localEnd = getBogotaDateTime(appointment.end_at);
    const exception = exceptions.find(
        (item) =>
            new Date(item.start_at) < new Date(appointment.end_at) &&
            new Date(item.end_at) > new Date(appointment.start_at),
    );
    return {
        id: appointment.id,
        date: localStart.date,
        startTime: localStart.time,
        endTime: localEnd.time,
        status: "Confirmada",
        reason: exception ? `Excepción: ${exception.reason}` : "Fuera del horario propuesto",
    };
}

export async function getDoctorScheduleContext(
    schedule,
    transaction,
    excludeAvailabilityId = null,
    previousAvailability = null,
) {
    const doctor = await Doctor.findByPk(schedule.doctorId, {
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
    if (!doctor) throw serviceError("El médico no existe o no está activo.", 404);

    const existingBlocks = await DoctorAvailability.findAll({
        where: {
            doctor_id: schedule.doctorId,
            is_active: true,
            ...(excludeAvailabilityId ? { id: { [Op.ne]: excludeAvailabilityId } } : {}),
        },
        attributes: ["day_of_week", "start_time", "end_time", "valid_from", "valid_until"],
        transaction,
    });
    validateExistingOverlaps(schedule, existingBlocks);

    const confirmedStatus = await AppointmentStatus.findOne({
        where: { name: "Confirmed" },
        attributes: ["id"],
        transaction,
    });
    if (!confirmedStatus)
        return { existingBlocks, impactedAppointments: [], impactedAppointmentRecords: [] };

    const [appointments, exceptions] = await Promise.all([
        Appointment.findAll({
            where: {
                doctor_id: schedule.doctorId,
                status_id: confirmedStatus.id,
                start_at: { [Op.gt]: new Date() },
            },
            attributes: ["id", "start_at", "end_at"],
            order: [["start_at", "ASC"]],
            transaction,
            lock: transaction.LOCK.UPDATE,
        }),
        DoctorScheduleException.findAll({
            where: {
                doctor_id: schedule.doctorId,
                is_active: true,
                exception_type: "Unavailable",
                end_at: { [Op.gt]: new Date() },
            },
            attributes: ["start_at", "end_at", "reason"],
            transaction,
        }),
    ]);

    const resultingBlocks = [
        ...existingBlocks.map((block) => ({
            day_of_week: block.day_of_week,
            start_time: block.start_time,
            end_time: block.end_time,
            valid_from: block.valid_from,
            valid_until: block.valid_until,
        })),
        ...schedule.blocks.map((block) => ({
            ...block,
            validFrom: schedule.validFrom,
            validUntil: schedule.validUntil,
        })),
    ];
    const previousBlocks = previousAvailability
        ? [
              ...existingBlocks.map((block) => ({
                  day_of_week: block.day_of_week,
                  start_time: block.start_time,
                  end_time: block.end_time,
                  valid_from: block.valid_from,
                  valid_until: block.valid_until,
              })),
              {
                  day_of_week: previousAvailability.day_of_week,
                  start_time: previousAvailability.start_time,
                  end_time: previousAvailability.end_time,
                  valid_from: previousAvailability.valid_from,
                  valid_until: previousAvailability.valid_until,
              },
          ]
        : null;
    const impactedAppointmentRecords = appointments.filter(
        (appointment) =>
            overlapsException(appointment, exceptions) ||
            (previousBlocks
                ? scheduleCovers(appointment, previousBlocks) &&
                  !scheduleCovers(appointment, resultingBlocks)
                : !scheduleCovers(appointment, resultingBlocks)),
    );
    const impactedAppointments = impactedAppointmentRecords.map((appointment) =>
        formatImpactAppointment(appointment, exceptions),
    );

    return { existingBlocks, impactedAppointments, impactedAppointmentRecords };
}

export async function cancelImpactedAppointments(actor, appointments, transaction, options = {}) {
    if (!appointments.length) return { cancelledCount: 0, queuedNotificationCount: 0 };

    const cancelledStatus = await AppointmentStatus.findOne({
        where: { name: "Cancelled" },
        transaction,
    });
    if (!cancelledStatus) {
        throw serviceError("No estÃ¡ configurado el estado de citas canceladas.", 500);
    }

    const occurredAt = new Date();
    const reason =
        options.reason ||
        "Cita cancelada automÃ¡ticamente por un cambio en el horario del mÃ©dico.";
    let queuedNotificationCount = 0;
    for (const appointment of appointments) {
        await appointment.update({ status_id: cancelledStatus.id }, { transaction });
        await AppointmentHistory.create(
            {
                appointment_id: appointment.id,
                actor_user_id: actor.id,
                actor_snapshot: `Administrator ${actor.email}`.slice(0, 100),
                event_type: "Cancelled",
                previous_values: {
                    status: "Confirmed",
                    start_at: new Date(appointment.start_at).toISOString(),
                    end_at: new Date(appointment.end_at).toISOString(),
                },
                new_values: { status: "Cancelled" },
                reason,
                occurred_at: occurredAt,
            },
            { transaction },
        );
        await AuditLog.create(
            {
                actor_user_id: actor.id,
                actor_snapshot: `Administrator ${actor.email}`.slice(0, 100),
                action: "AdminAppointmentCancelled",
                target_type: "Appointment",
                target_id: String(appointment.id),
                changes: {
                    previous: { status: "Confirmed" },
                    next: { status: "Cancelled" },
                    ...(options.auditCause ? { cancellationCause: options.auditCause } : {}),
                },
                reason,
                result: "Success",
                occurred_at: occurredAt,
            },
            { transaction },
        );
        await cancelPendingAppointmentReminders(appointment.id, transaction);
        const notifications = await enqueueAppointmentNotifications({
            appointmentId: appointment.id,
            eventType: "appointment_cancellation",
            transaction,
        });
        queuedNotificationCount += notifications.length;
    }

    return { cancelledCount: appointments.length, queuedNotificationCount };
}

export function formatScheduleCancellationDetails({ cancelledCount, queuedNotificationCount }) {
    if (!cancelledCount) return null;

    const notificationMessage = queuedNotificationCount
        ? `Notificaciones encoladas: ${queuedNotificationCount}.`
        : "No se encolaron notificaciones; verifica la configuración de entregas y las preferencias de los pacientes.";
    return `Se cancelaron ${cancelledCount} citas afectadas. ${notificationMessage}`;
}

/** Create weekly availability and resolve affected appointments after confirmation. */
export async function configureAdminDoctorSchedule(input, actorId = null) {
    const schedule = normalizeDoctorSchedule(input);
    return database.transaction(async (transaction) => {
        const { impactedAppointments, impactedAppointmentRecords } = await getDoctorScheduleContext(
            schedule,
            transaction,
        );
        if (impactedAppointments.length > 0 && input.confirmImpact !== true) {
            throw serviceError(
                "Hay citas confirmadas que requieren revisión antes de guardar el horario.",
                409,
                { requiresConfirmation: true, impactedAppointments },
            );
        }

        let cancellation = { cancelledCount: 0, queuedNotificationCount: 0 };
        if (impactedAppointmentRecords.length > 0) {
            const actor = await User.findByPk(actorId, {
                attributes: ["id", "email"],
                transaction,
            });
            if (!actor) throw serviceError("No se encontrÃ³ la sesiÃ³n del administrador.", 401);
            cancellation = await cancelImpactedAppointments(
                actor,
                impactedAppointmentRecords,
                transaction,
            );
        }

        const records = schedule.blocks.map((block) => ({
            doctor_id: schedule.doctorId,
            day_of_week: block.dayOfWeek,
            start_time: block.startTime,
            end_time: block.endTime,
            valid_from: schedule.validFrom,
            valid_until: schedule.validUntil,
            is_active: true,
        }));
        const created = await DoctorAvailability.bulkCreate(records, {
            transaction,
            validate: true,
        });
        return {
            doctorId: schedule.doctorId,
            availability: created.map((block) => ({
                id: block.id,
                dayOfWeek: block.day_of_week,
                dayLabel: WEEKDAY_LABELS[block.day_of_week - 1],
                startTime: String(block.start_time).slice(0, 5),
                endTime: String(block.end_time).slice(0, 5),
                validFrom: String(block.valid_from).slice(0, 10),
                validUntil: block.valid_until ? String(block.valid_until).slice(0, 10) : null,
            })),
            confirmedAppointmentsReviewed: impactedAppointments.length,
            cancelledAppointments: cancellation.cancelledCount,
            queuedNotifications: cancellation.queuedNotificationCount,
            cancellationDetails: formatScheduleCancellationDetails(cancellation),
        };
    });
}
