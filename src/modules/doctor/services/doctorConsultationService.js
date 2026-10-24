import database from "../../../config/database.js";
import {
    Appointment,
    AppointmentHistory,
    AppointmentStatus,
    Consultation,
    Doctor,
} from "../../../models/associations.js";

const CONFIRMED_STATUS = "Confirmed";
const IN_PROGRESS_APPOINTMENT_STATUS = "In Progress";
const ACTIVE_CONSULTATION_STATUS = "InProgress";

function createServiceError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parseAppointmentId(value) {
    const appointmentId = Number(value);
    if (!Number.isSafeInteger(appointmentId) || appointmentId < 1) {
        throw createServiceError("El identificador de la cita no es válido.", 400);
    }
    return appointmentId;
}

/** Start an assigned confirmed appointment and its consultation atomically. */
export async function startDoctorConsultation(userId, rawAppointmentId) {
    const appointmentId = parseAppointmentId(rawAppointmentId);

    return database.transaction(async (transaction) => {
        // Locking the doctor serializes consultation starts for the same doctor.
        const doctor = await Doctor.findOne({
            where: { user_id: userId },
            attributes: ["id"],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (!doctor) {
            throw createServiceError("No se encontró el perfil médico.", 404);
        }

        // Lock the appointment to prevent simultaneous state changes while it starts.
        const appointment = await Appointment.findOne({
            where: { id: appointmentId, doctor_id: doctor.id },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (!appointment) {
            throw createServiceError("No encontramos una cita asignada a tu perfil.", 404);
        }

        const appointmentStatus = await AppointmentStatus.findByPk(appointment.status_id, {
            attributes: ["id", "name"],
            transaction,
        });

        if (appointmentStatus?.name !== CONFIRMED_STATUS) {
            throw createServiceError("Solo puedes iniciar una cita confirmada.", 409);
        }

        const activeConsultation = await Consultation.findOne({
            where: { doctor_id: doctor.id, status: ACTIVE_CONSULTATION_STATUS },
            attributes: ["id"],
            transaction,
        });

        if (activeConsultation) {
            throw createServiceError(
                "Ya tienes una consulta en curso. Termínala antes de iniciar otra.",
                409,
            );
        }

        const inProgressStatus = await AppointmentStatus.findOne({
            where: { name: IN_PROGRESS_APPOINTMENT_STATUS },
            attributes: ["id"],
            transaction,
        });

        if (!inProgressStatus) {
            throw new Error("The In Progress appointment status is not configured.");
        }

        const startedAt = new Date();
        const consultation = await Consultation.create(
            {
                appointment_id: appointment.id,
                doctor_id: doctor.id,
                started_at: startedAt,
                status: ACTIVE_CONSULTATION_STATUS,
            },
            { transaction },
        );

        await appointment.update({ status_id: inProgressStatus.id }, { transaction });

        // Keep an audit entry for the appointment state transition.
        await AppointmentHistory.create(
            {
                appointment_id: appointment.id,
                actor_user_id: userId,
                actor_snapshot: `Doctor ${doctor.id}`,
                event_type: "ConsultationStarted",
                previous_values: { status: CONFIRMED_STATUS },
                new_values: {
                    status: IN_PROGRESS_APPOINTMENT_STATUS,
                    consultation_id: consultation.id,
                    started_at: startedAt.toISOString(),
                },
                reason: "Doctor started the appointment consultation.",
                occurred_at: startedAt,
            },
            { transaction },
        );

        return {
            message: "La consulta comenzó correctamente.",
            consultation: {
                id: consultation.id,
                appointmentId: appointment.id,
                status: consultation.status,
                startedAt: consultation.started_at,
            },
        };
    });
}
