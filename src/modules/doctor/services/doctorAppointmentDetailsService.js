import {
    Appointment,
    AppointmentStatus,
    Doctor,
    Patient,
    Specialities,
} from "../../../models/associations.js";

const TIME_ZONE = "America/Bogota";
const STATUS_LABELS = {
    Confirmed: "Confirmada",
    "In Progress": "En curso",
    Attended: "Atendida",
    Cancelled: "Cancelada",
    "No Show": "No asistió",
};

function createNotFoundError() {
    return Object.assign(new Error("No se encontró la cita solicitada."), { statusCode: 404 });
}

function parseAppointmentId(value) {
    if (typeof value !== "string" || !/^\d+$/.test(value)) throw createNotFoundError();
    const appointmentId = Number(value);
    if (!Number.isSafeInteger(appointmentId) || appointmentId < 1) throw createNotFoundError();
    return appointmentId;
}

function getPatientName(patient) {
    return [patient?.first_name, patient?.last_name].filter(Boolean).join(" ") || "Paciente";
}

function getSafePhotoUrl(value) {
    return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
        ? value
        : null;
}

function formatDate(date) {
    return new Intl.DateTimeFormat("es-CO", {
        timeZone: TIME_ZONE,
        dateStyle: "full",
    }).format(date);
}

function formatTime(date) {
    return new Intl.DateTimeFormat("es-CO", {
        timeZone: TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
    }).format(date);
}

export async function getDoctorAppointmentDetails(userId, rawAppointmentId) {
    const appointmentId = parseAppointmentId(rawAppointmentId);
    const doctor = await Doctor.findOne({
        where: { user_id: userId },
        attributes: ["id"],
    });
    if (!doctor) throw createNotFoundError();

    const appointment = await Appointment.findOne({
        where: { id: appointmentId, doctor_id: doctor.id },
        attributes: ["id", "start_at", "end_at"],
        include: [
            {
                model: Patient,
                as: "patient",
                attributes: ["first_name", "last_name", "profile_photo_url"],
                required: true,
            },
            {
                model: AppointmentStatus,
                as: "status",
                attributes: ["name"],
                required: true,
            },
            {
                model: Specialities,
                as: "specialty",
                attributes: ["name"],
                required: false,
            },
        ],
    });
    if (!appointment) throw createNotFoundError();

    const startAt = new Date(appointment.start_at);
    const endAt = new Date(appointment.end_at);
    const status = appointment.status?.name;

    return {
        id: appointment.id,
        patientName: getPatientName(appointment.patient),
        patientPhotoUrl: getSafePhotoUrl(appointment.patient?.profile_photo_url),
        specialty: appointment.specialty?.name || "No registrada",
        date: formatDate(startAt),
        startTime: formatTime(startAt),
        endTime: formatTime(endAt),
        statusLabel: STATUS_LABELS[status] || "Estado no disponible",
    };
}
