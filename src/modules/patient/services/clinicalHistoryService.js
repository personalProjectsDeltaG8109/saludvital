import {
    Appointment,
    Consultation,
    Diagnosis,
    Doctor,
    Patient,
    Prescription,
    PrescriptionItem,
    Specialities,
} from "../../../models/associations.js";

const BOGOTA_TIME_ZONE = "America/Bogota";

function formatConsultationDate(date) {
    return new Intl.DateTimeFormat("es-CO", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: BOGOTA_TIME_ZONE,
    }).format(date);
}

function formatConsultationTime(date) {
    return new Intl.DateTimeFormat("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: BOGOTA_TIME_ZONE,
    }).format(date);
}

export async function getPatientClinicalHistory(userId) {
    const patient = await Patient.findOne({
        where: { user_id: userId },
        attributes: ["id"],
    });

    if (!patient) return [];

    const consultations = await Consultation.findAll({
        where: { status: "Completed" },
        include: [
            {
                model: Appointment,
                as: "appointment",
                required: true,
                where: { patient_id: patient.id },
                include: [
                    {
                        model: Specialities,
                        as: "specialty",
                        attributes: ["name"],
                    },
                ],
            },
            { model: Diagnosis, as: "diagnoses" },
            {
                model: Doctor,
                as: "doctor",
                attributes: ["id", "display_name", "profile_photo_url"],
            },
            {
                model: Prescription,
                as: "prescriptions",
                include: [{ model: PrescriptionItem, as: "items" }],
            },
        ],
        order: [["started_at", "DESC"]],
    });

    return consultations.map((consultation) => {
        const record = consultation.get({ plain: true });
        const startedAt = new Date(record.started_at);
        const endedAt = record.ended_at ? new Date(record.ended_at) : null;

        return {
            ...record,
            date_label: formatConsultationDate(startedAt),
            time_label: `${formatConsultationTime(startedAt)}${
                endedAt ? ` - ${formatConsultationTime(endedAt)}` : ""
            }`,
            specialty_label: record.appointment?.specialty?.name || "Consulta médica",
            // Identify the responsible clinician without exposing account details.
            doctor_label: record.doctor?.display_name || "Profesional de salud",
            // Return only the configured public image path for the responsible doctor.
            doctor_photo_url: record.doctor?.profile_photo_url || null,
            diagnoses: record.diagnoses || [],
            prescriptions: record.prescriptions || [],
        };
    });
}
