import { Appointment, AppointmentHistory } from "../../../models/associations.js";
import { getAdminAppointmentBookingDoctors } from "./adminAppointmentCreationService.js";
import {
    getAvailableSpecialties,
    reschedulePatientAppointment,
} from "../../patient/services/appointmentService.js";

const STATUS_LABELS = {
    Confirmed: "Confirmada",
    "In Progress": "En curso",
    Attended: "Asistida",
    Cancelled: "Cancelada",
};
const MAX_RESCHEDULES = 3;

function parseAppointmentId(value) {
    const isNumericIdentifier =
        (typeof value === "number" && Number.isSafeInteger(value)) ||
        (typeof value === "string" && /^\d+$/.test(value));
    const appointmentId = isNumericIdentifier ? Number(value) : NaN;
    if (!Number.isSafeInteger(appointmentId) || appointmentId < 1) {
        const error = new Error("No encontramos esa cita.");
        error.statusCode = 404;
        throw error;
    }
    return appointmentId;
}

function getBogotaDateTime(value) {
    const date = new Date(value);
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
    return {
        date: `${values.year}-${values.month}-${values.day}`,
        dateLabel: new Intl.DateTimeFormat("es-CO", {
            dateStyle: "full",
            timeZone: "America/Bogota",
        }).format(date),
        time: `${values.hour}:${values.minute}`,
    };
}

/** Load the appointment values and lifecycle state needed by the edit form. */
export async function getAdminAppointmentForEditing(rawAppointmentId) {
    const appointmentId = parseAppointmentId(rawAppointmentId);
    const appointment = await Appointment.findByPk(appointmentId, {
        attributes: [
            "id",
            "start_at",
            "end_at",
            "patient_id",
            "doctor_id",
            "specialty_id",
            "reason",
        ],
        include: [
            {
                association: "patient",
                attributes: ["id", "first_name", "last_name"],
                required: true,
            },
            {
                association: "doctor",
                attributes: ["id", "display_name"],
                required: true,
            },
            {
                association: "specialty",
                attributes: ["id", "name"],
                required: true,
            },
            {
                association: "status",
                attributes: ["id", "name"],
                required: true,
            },
        ],
    });

    if (!appointment?.status || !STATUS_LABELS[appointment.status.name]) {
        const error = new Error("No encontramos esa cita.");
        error.statusCode = 404;
        throw error;
    }

    const [rescheduleCount, currentDateTime] = await Promise.all([
        AppointmentHistory.count({
            where: { appointment_id: appointment.id, event_type: "Rescheduled" },
        }),
        getBogotaDateTime(appointment.start_at),
    ]);
    const canEdit =
        appointment.status.name === "Confirmed" &&
        new Date(appointment.start_at).getTime() > Date.now() &&
        rescheduleCount < MAX_RESCHEDULES;

    let unavailableMessage = "";
    if (appointment.status.name !== "Confirmed") {
        unavailableMessage = "Solo se pueden editar citas confirmadas.";
    } else if (new Date(appointment.start_at).getTime() <= Date.now()) {
        unavailableMessage = "Esta cita ya inició y no se puede editar.";
    } else if (rescheduleCount >= MAX_RESCHEDULES) {
        unavailableMessage = "Esta cita ya alcanzó el límite de reprogramaciones.";
    }

    return {
        id: appointment.id,
        startAt: new Date(appointment.start_at).toISOString(),
        endAt: new Date(appointment.end_at).toISOString(),
        currentDate: currentDateTime.date,
        currentDateLabel: currentDateTime.dateLabel,
        currentTime: currentDateTime.time,
        patient: {
            id: appointment.patient.id,
            name: `${appointment.patient.first_name} ${appointment.patient.last_name}`.trim(),
        },
        doctor: {
            id: appointment.doctor.id,
            name: appointment.doctor.display_name || `Médico ${appointment.doctor.id}`,
        },
        specialty: {
            id: appointment.specialty.id,
            name: appointment.specialty.name,
        },
        status: appointment.status.name,
        statusLabel: STATUS_LABELS[appointment.status.name],
        reason: appointment.reason || "",
        canEdit,
        unavailableMessage,
        reschedulesRemaining: Math.max(0, MAX_RESCHEDULES - rescheduleCount),
    };
}

/** Return the active doctors currently assigned to an active specialty. */
export async function getAdminAppointmentEditDoctors(rawSpecialtyId) {
    return getAdminAppointmentBookingDoctors(rawSpecialtyId);
}

/** Return the active specialty options available to an appointment editor. */
export async function getAdminAppointmentEditSpecialties() {
    const specialties = await getAvailableSpecialties();
    return specialties.map((specialty) => ({ id: specialty.id, name: specialty.name }));
}

/** Apply an administrator edit through the existing transactional reschedule rules. */
export async function updateAdminAppointment(adminUserId, rawAppointmentId, values) {
    const appointmentId = parseAppointmentId(rawAppointmentId);
    const appointment = await Appointment.findByPk(appointmentId, {
        attributes: ["id", "patient_id"],
        include: [
            {
                association: "patient",
                attributes: ["id", "user_id"],
                required: true,
            },
        ],
    });
    if (!appointment) {
        const error = new Error("No encontramos esa cita.");
        error.statusCode = 404;
        throw error;
    }

    return reschedulePatientAppointment({
        userId: appointment.patient.user_id,
        actorUserId: adminUserId,
        actorSnapshot: `Administrator ${adminUserId}`,
        appointmentId,
        doctorId: values.doctorId,
        specialtyId: values.specialtyId,
        date: values.date,
        time: values.time,
        reason: values.reason,
    });
}
