import database from "../../../../config/database.js";
import { DoctorAvailability, User } from "../../../models/associations.js";
import AuditLog from "../../../models/AuditLog.js";
import {
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

/** Update one existing weekly availability block without changing appointments. */
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
        if (proposedSchedule.blocks.length !== 1) {
            throw serviceError("Edita un solo intervalo por vez.");
        }
        const { impactedAppointments } = await getDoctorScheduleContext(
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

        await AuditLog.create(
            {
                actor_user_id: actor.id,
                actor_snapshot: `Administrator ${actor.email}`.slice(0, 100),
                action: "AdminDoctorScheduleUpdated",
                target_type: "DoctorAvailability",
                target_id: String(scheduleId),
                target_description: `Doctor ${currentSchedule.doctor_id} weekly availability`,
                changes: { before: previousValues, after: updatedValues },
                reason: "Administrator edited doctor weekly availability.",
                result: "Success",
                occurred_at: new Date(),
            },
            { transaction },
        );

        return {
            doctorId: currentSchedule.doctor_id,
            availability: { id: updatedSchedule.id, ...updatedValues },
            confirmedAppointmentsReviewed: impactedAppointments.length,
            message: "El horario se actualizó correctamente.",
        };
    });
}
