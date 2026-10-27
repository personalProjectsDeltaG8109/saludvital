import database from "../../../../config/database.js";
import { DoctorAvailability, User } from "../../../models/associations.js";
import AuditLog from "../../../models/AuditLog.js";
import {
    cancelImpactedAppointments,
    formatScheduleCancellationDetails,
    getDoctorScheduleContext,
    normalizeDoctorSchedule,
} from "./adminDoctorScheduleConfigurationService.js";

function serviceError(message, statusCode = 400, details = {}) {
    return Object.assign(new Error(message), { statusCode, ...details });
}

function parseScheduleId(value) {
    const scheduleId = Number(value);
    if (!Number.isSafeInteger(scheduleId) || scheduleId < 1) {
        throw serviceError("El horario seleccionado no es válido.");
    }
    return scheduleId;
}

function scheduleValues(schedule) {
    return {
        dayOfWeek: schedule.day_of_week,
        startTime: String(schedule.start_time).slice(0, 5),
        endTime: String(schedule.end_time).slice(0, 5),
        validFrom: String(schedule.valid_from).slice(0, 10),
        validUntil: schedule.valid_until ? String(schedule.valid_until).slice(0, 10) : null,
    };
}

/** Update one existing block and add any additional non-overlapping blocks. */
export async function updateAdminDoctorSchedule(actorId, rawScheduleId, input = {}) {
    const scheduleId = parseScheduleId(rawScheduleId);
    return database.transaction(async (transaction) => {
        const currentSchedule = await DoctorAvailability.findByPk(scheduleId, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!currentSchedule || !currentSchedule.is_active) {
            throw serviceError("No encontramos el horario activo que deseas editar.", 404);
        }

        const proposedSchedule = normalizeDoctorSchedule({
            ...input,
            doctorId: currentSchedule.doctor_id,
        });
        const { impactedAppointments, impactedAppointmentRecords } = await getDoctorScheduleContext(
            proposedSchedule,
            transaction,
            scheduleId,
            currentSchedule,
        );
        if (impactedAppointments.length > 0 && input.confirmImpact !== true) {
            throw serviceError(
                "Revisa las citas confirmadas afectadas antes de guardar el cambio.",
                409,
                { requiresConfirmation: true, impactedAppointments },
            );
        }

        const actor = await User.findByPk(actorId, {
            attributes: ["id", "email"],
            transaction,
        });
        if (!actor) throw serviceError("No se encontró la sesión del administrador.", 401);

        const cancellation = await cancelImpactedAppointments(
            actor,
            impactedAppointmentRecords,
            transaction,
        );
        const previousValues = scheduleValues(currentSchedule);
        const updatedSchedule = await currentSchedule.update(
            {
                day_of_week: proposedSchedule.blocks[0].dayOfWeek,
                start_time: proposedSchedule.blocks[0].startTime,
                end_time: proposedSchedule.blocks[0].endTime,
                valid_from: proposedSchedule.validFrom,
                valid_until: proposedSchedule.validUntil,
            },
            { transaction, validate: true },
        );
        const updatedValues = scheduleValues(updatedSchedule);
        const additionalSchedules = proposedSchedule.blocks.slice(1).map((block) => ({
            doctor_id: currentSchedule.doctor_id,
            day_of_week: block.dayOfWeek,
            start_time: block.startTime,
            end_time: block.endTime,
            valid_from: proposedSchedule.validFrom,
            valid_until: proposedSchedule.validUntil,
            is_active: true,
        }));
        const createdSchedules = additionalSchedules.length
            ? await DoctorAvailability.bulkCreate(additionalSchedules, {
                  transaction,
                  validate: true,
              })
            : [];
        const createdValues = createdSchedules.map((schedule) => ({
            id: schedule.id,
            ...scheduleValues(schedule),
        }));

        await AuditLog.create(
            {
                actor_user_id: actor.id,
                actor_snapshot: `Administrator ${actor.email}`.slice(0, 100),
                action: "AdminDoctorScheduleUpdated",
                target_type: "DoctorAvailability",
                target_id: String(scheduleId),
                target_description: `Doctor ${currentSchedule.doctor_id} weekly availability`,
                changes: {
                    before: previousValues,
                    after: updatedValues,
                    added: createdValues,
                },
                reason: "Administrator edited doctor weekly availability.",
                result: "Success",
                occurred_at: new Date(),
            },
            { transaction },
        );

        return {
            doctorId: currentSchedule.doctor_id,
            availability: { id: updatedSchedule.id, ...updatedValues },
            additionalAvailability: createdValues,
            confirmedAppointmentsReviewed: impactedAppointments.length,
            cancelledAppointments: cancellation.cancelledCount,
            queuedNotifications: cancellation.queuedNotificationCount,
            cancellationDetails: formatScheduleCancellationDetails(cancellation),
            message: "El horario se actualizó correctamente.",
        };
    });
}

export async function deleteAdminDoctorSchedule(actorId, rawScheduleId, input = {}) {
    const scheduleId = parseScheduleId(rawScheduleId);
    return database.transaction(async (transaction) => {
        const currentSchedule = await DoctorAvailability.findByPk(scheduleId, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!currentSchedule || !currentSchedule.is_active) {
            throw serviceError("No encontramos el intervalo activo que deseas eliminar.", 404);
        }

        const proposedSchedule = {
            doctorId: currentSchedule.doctor_id,
            validFrom: String(currentSchedule.valid_from).slice(0, 10),
            validUntil: currentSchedule.valid_until
                ? String(currentSchedule.valid_until).slice(0, 10)
                : null,
            blocks: [],
        };
        const { impactedAppointments, impactedAppointmentRecords } = await getDoctorScheduleContext(
            proposedSchedule,
            transaction,
            scheduleId,
            currentSchedule,
        );
        if (impactedAppointments.length > 0 && input.confirmImpact !== true) {
            throw serviceError(
                "Revisa las citas confirmadas afectadas antes de eliminar el intervalo.",
                409,
                { requiresConfirmation: true, impactedAppointments },
            );
        }

        const actor = await User.findByPk(actorId, {
            attributes: ["id", "email"],
            transaction,
        });
        if (!actor) throw serviceError("No se encontró la sesión del administrador.", 401);

        const cancellation = await cancelImpactedAppointments(
            actor,
            impactedAppointmentRecords,
            transaction,
        );
        const previousValues = scheduleValues(currentSchedule);
        await currentSchedule.update({ is_active: false }, { transaction, validate: true });

        await AuditLog.create(
            {
                actor_user_id: actor.id,
                actor_snapshot: `Administrator ${actor.email}`.slice(0, 100),
                action: "AdminDoctorScheduleDeleted",
                target_type: "DoctorAvailability",
                target_id: String(scheduleId),
                target_description: `Doctor ${currentSchedule.doctor_id} weekly availability interval`,
                changes: { before: previousValues, after: null },
                reason: "Administrator removed a doctor availability interval.",
                result: "Success",
                occurred_at: new Date(),
            },
            { transaction },
        );

        return {
            doctorId: currentSchedule.doctor_id,
            confirmedAppointmentsReviewed: impactedAppointments.length,
            cancelledAppointments: cancellation.cancelledCount,
            queuedNotifications: cancellation.queuedNotificationCount,
            cancellationDetails: formatScheduleCancellationDetails(cancellation),
            message: "El intervalo se eliminó correctamente.",
        };
    });
}
