import database from "../../../../config/database.js";
import {
    Appointment,
    AppointmentStatus,
    AppointmentHistory,
    User,
} from "../../../models/associations.js";
import AuditLog from "../../../models/AuditLog.js";
import {
    cancelPendingAppointmentReminders,
    enqueueAppointmentNotifications,
} from "../../patient/services/notificationAutomationService.js";

const CONFIRMED_STATUS = "Confirmed";
const CANCELLED_STATUS = "Cancelled";
const MAX_REASON_LENGTH = 500;

function serviceError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parseAppointmentId(value) {
    const appointmentId = Number(value);
    if (!Number.isSafeInteger(appointmentId) || appointmentId < 1) {
        throw serviceError("No encontramos esa cita.", 404);
    }
    return appointmentId;
}

function normalizeReason(value) {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string" || value.trim().length > MAX_REASON_LENGTH) {
        throw serviceError("El motivo no puede superar los 500 caracteres.");
    }
    return value.trim() || null;
}

/** Cancel a future confirmed appointment and preserve its audit trail. */
export async function cancelAdminAppointment(actorUserId, rawAppointmentId, values = {}) {
    const appointmentId = parseAppointmentId(rawAppointmentId);
    const reason = normalizeReason(values.reason);

    return database.transaction(async (transaction) => {
        const appointment = await Appointment.findByPk(appointmentId, {
            attributes: ["id", "start_at", "status_id", "patient_id"],
            include: [{ association: "status", attributes: ["id", "name"], required: true }],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!appointment) throw serviceError("No encontramos esa cita.", 404);
        if (appointment.status?.name !== CONFIRMED_STATUS) {
            throw serviceError("Solo se pueden cancelar citas confirmadas.", 409);
        }
        if (new Date(appointment.start_at).getTime() <= Date.now()) {
            throw serviceError("No se pueden cancelar citas que ya iniciaron.", 409);
        }

        const actor = await User.findByPk(actorUserId, {
            attributes: ["id", "email"],
            transaction,
        });
        if (!actor) throw serviceError("No se encontró la sesión del administrador.", 401);

        const cancelledStatus = await AppointmentStatus.findOne({
            where: { name: CANCELLED_STATUS },
            transaction,
        });
        if (!cancelledStatus)
            throw serviceError("No está configurado el estado de cancelación.", 500);

        const occurredAt = new Date();
        const cancellationReason = reason || "Administrator cancelled the appointment.";
        await appointment.update({ status_id: cancelledStatus.id }, { transaction });
        await AppointmentHistory.create(
            {
                appointment_id: appointment.id,
                actor_user_id: actor.id,
                actor_snapshot: `Administrator ${actor.email}`.slice(0, 100),
                event_type: "Cancelled",
                previous_values: { status: CONFIRMED_STATUS },
                new_values: { status: CANCELLED_STATUS },
                reason: cancellationReason,
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
                    previous: { status: CONFIRMED_STATUS },
                    next: { status: CANCELLED_STATUS },
                },
                reason: cancellationReason,
                result: "Success",
                occurred_at: occurredAt,
            },
            { transaction },
        );
        await cancelPendingAppointmentReminders(appointment.id, transaction);
        await enqueueAppointmentNotifications({
            appointmentId: appointment.id,
            eventType: "appointment_cancellation",
            transaction,
        });

        return {
            appointmentId: appointment.id,
            status: CANCELLED_STATUS,
            statusLabel: "Cancelada",
        };
    });
}
