import { Patient, User } from "../../../models/associations.js";
import {
    bookAppointment,
    getAvailableDoctors,
    getAvailableSpecialties,
    getAvailableTimeSlots,
} from "../../patient/services/appointmentService.js";

function parsePositiveId(value, selectionLabel) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) {
        const error = new Error(`Selecciona ${selectionLabel}.`);
        error.statusCode = 400;
        throw error;
    }
    return id;
}

/** Return active patient and specialty records for the appointment form. */
export async function getAdminAppointmentBookingOptions() {
    const [patients, specialties] = await Promise.all([
        Patient.findAll({
            attributes: ["id", "first_name", "last_name", "document_type", "document_number"],
            include: [
                {
                    model: User,
                    as: "user",
                    required: true,
                    where: { is_active: true },
                    attributes: [],
                },
            ],
            order: [
                ["first_name", "ASC"],
                ["last_name", "ASC"],
            ],
        }),
        getAvailableSpecialties(),
    ]);

    return {
        patients: patients.map((patient) => ({
            id: patient.id,
            name: `${patient.first_name} ${patient.last_name}`.trim(),
            document: [patient.document_type, patient.document_number].filter(Boolean).join(" "),
        })),
        specialties: specialties.map((specialty) => ({
            id: specialty.id,
            name: specialty.name,
        })),
    };
}

/** Return only active doctors assigned to the selected active specialty. */
export async function getAdminAppointmentBookingDoctors(rawSpecialtyId) {
    const doctors = await getAvailableDoctors(rawSpecialtyId);
    return doctors.map((doctor) => ({
        id: doctor.id,
        name: doctor.display_name,
        photoUrl: doctor.profile_photo_url || null,
    }));
}

/** Return bookable times for an active patient, specialty, doctor, and date. */
export async function getAdminAppointmentBookingTimes({ patientId, specialtyId, doctorId, date }) {
    patientId = parsePositiveId(patientId, "un paciente válido");
    specialtyId = parsePositiveId(specialtyId, "una especialidad válida");
    doctorId = parsePositiveId(doctorId, "un médico válido");

    const doctors = await getAvailableDoctors(specialtyId);
    const doctorBelongsToSpecialty = doctors.some((doctor) => doctor.id === doctorId);
    if (!doctorBelongsToSpecialty) {
        const error = new Error("El médico no está disponible para esta especialidad.");
        error.statusCode = 404;
        throw error;
    }

    const patient = await Patient.findByPk(patientId, {
        attributes: ["id", "user_id"],
        include: [
            {
                model: User,
                as: "user",
                required: true,
                where: { is_active: true },
                attributes: [],
            },
        ],
    });
    if (!patient) {
        const error = new Error("El paciente seleccionado no está disponible.");
        error.statusCode = 404;
        throw error;
    }

    return getAvailableTimeSlots(doctorId, date, patient.user_id);
}

/** Create an appointment through the existing transactional booking workflow. */
export async function createAdminAppointment(adminUserId, appointmentData) {
    const patientId = Number(appointmentData.patientId);
    if (!Number.isSafeInteger(patientId) || patientId < 1) {
        const error = new Error("Selecciona un paciente válido.");
        error.statusCode = 400;
        throw error;
    }

    return bookAppointment({
        patientId,
        actorUserId: adminUserId,
        actorSnapshot: `Administrator ${adminUserId}`,
        source: "Admin",
        specialtyId: appointmentData.specialtyId,
        doctorId: appointmentData.doctorId,
        date: appointmentData.date,
        time: appointmentData.time,
        reason: appointmentData.reason,
    });
}
