import { Router } from "express";
import { authenticateToken, requireRole } from "../../../middleware/authenticateToken.js";
import { Op } from "sequelize";
import {
    Appointment,
    Patient as PatientModel,
    Doctor,
    Specialities,
    AppointmentStatus,
    AppointmentHistory,
} from "../../../models/associations.js";
import {
    listPatientNotifications,
    savePatientNotificationPreferences,
} from "../controllers/notificationController.js";
import {
    deletePatientAccount,
    savePatientProfile,
    savePatientProfilePhoto,
} from "../controllers/profileController.js";
import {
    listAvailableSpecialties,
    listAvailableDoctors,
    listAvailableTimeSlots,
    createPatientAppointment,
    listReschedulableAppointments,
    updatePatientAppointmentTime,
} from "../controllers/appointmentController.js";
import { getReschedulableAppointments } from "../services/appointmentService.js";
import {
    getPatientNotificationSettings,
    notificationEvents,
} from "../services/notificationService.js";
import { getPatientProfile } from "../services/profileService.js";
import { getPatientClinicalHistory } from "../services/clinicalHistoryService.js";
import { getDepartments, getMunicipalities } from "../../auth/services/locationService.js";

// Define the routes available to patients.
const patientRoutes = Router();
const appointmentStats = [
    { key: "all", label: "Total de citas", status: null },
    { key: "confirmed", label: "Confirmadas", status: "Confirmed" },
    { key: "in-progress", label: "En curso", status: "In Progress" },
    { key: "attended", label: "Atendidas", status: "Attended" },
    { key: "cancelled", label: "Cancelada", status: "Cancelled" },
];

async function getPatientName(userId) {
    const patient = await PatientModel.findOne({
        where: { user_id: userId },
        attributes: ["first_name", "last_name"],
    });
    return patient ? `${patient.first_name} ${patient.last_name}` : "Paciente";
}

patientRoutes.get(
    "/api/patient/notifications",
    authenticateToken,
    requireRole("Patient"),
    listPatientNotifications,
);

patientRoutes.patch(
    "/api/patient/notifications/preferences",
    authenticateToken,
    requireRole("Patient"),
    savePatientNotificationPreferences,
);

patientRoutes.put(
    "/api/patient/profile",
    authenticateToken,
    requireRole("Patient"),
    savePatientProfile,
);

patientRoutes.post(
    "/api/patient/profile/photo",
    authenticateToken,
    requireRole("Patient"),
    savePatientProfilePhoto,
);

patientRoutes.delete(
    "/api/patient/profile",
    authenticateToken,
    requireRole("Patient"),
    deletePatientAccount,
);

// Return active specialties available for appointment booking.
patientRoutes.get(
    "/api/patient/specialties",
    authenticateToken,
    requireRole("Patient"),
    listAvailableSpecialties,
);

// Return active doctors for the selected specialty.
patientRoutes.get(
    "/api/patient/specialties/:specialtyId/doctors",
    authenticateToken,
    requireRole("Patient"),
    listAvailableDoctors,
);

// Return bookable times for a selected doctor and local date.
patientRoutes.get(
    "/api/patient/doctors/:doctorId/availability",
    authenticateToken,
    requireRole("Patient"),
    listAvailableTimeSlots,
);

// Create an appointment for the authenticated patient.
patientRoutes.post(
    "/api/patient/appointments",
    authenticateToken,
    requireRole("Patient"),
    createPatientAppointment,
);

patientRoutes.get(
    "/api/patient/appointments/reschedulable",
    authenticateToken,
    requireRole("Patient"),
    listReschedulableAppointments,
);

patientRoutes.post(
    "/api/patient/appointments/:appointmentId/reschedule",
    authenticateToken,
    requireRole("Patient"),
    updatePatientAppointmentTime,
);
// Render the patient dashboard with authentication and role authorization.
patientRoutes.get(
    "/patient/dashboard",
    authenticateToken,
    requireRole("Patient"),
    async (req, res, next) => {
        try {
            const patient = await PatientModel.findOne({
                where: { user_id: req.auth.userId },
                attributes: ["id", "first_name", "last_name"],
            });
            const storedNextAppointment = patient
                ? await Appointment.findOne({
                      where: {
                          patient_id: patient.id,
                          end_at: { [Op.gt]: new Date() },
                      },
                      include: [
                          {
                              model: AppointmentStatus,
                              as: "status",
                              required: true,
                              where: { name: { [Op.in]: ["Confirmed", "In Progress"] } },
                              attributes: ["name"],
                          },
                          { model: Doctor, as: "doctor", required: true, attributes: ["id"] },
                          {
                              model: Specialities,
                              as: "specialty",
                              required: true,
                              attributes: ["name"],
                          },
                          {
                              model: AppointmentHistory,
                              as: "history",
                              attributes: [
                                  "event_type",
                                  "previous_values",
                                  "new_values",
                                  "occurred_at",
                              ],
                          },
                      ],
                      order: [["start_at", "ASC"]],
                  })
                : null;
            const nextAppointment = storedNextAppointment
                ? storedNextAppointment.get({ plain: true })
                : null;

            if (nextAppointment) {
                // Add patient-facing fallback labels where the schema has no clinic or doctor name.
                nextAppointment.doctor_label = `Médico #${nextAppointment.doctor.id}`;
                nextAppointment.site_label = "Sede SaludVital";
                nextAppointment.history = nextAppointment.history
                    .filter((event) => event.event_type === "Rescheduled")
                    .sort(
                        (first, second) =>
                            new Date(first.occurred_at).getTime() -
                            new Date(second.occurred_at).getTime(),
                    );
                const isConfirmed = nextAppointment.status.name === "Confirmed";
                const hasEnoughNotice =
                    new Date(nextAppointment.start_at).getTime() > Date.now() + 24 * 60 * 60 * 1000;
                const hasReschedulesLeft = nextAppointment.history.length < 3;
                nextAppointment.can_reschedule =
                    isConfirmed && hasEnoughNotice && hasReschedulesLeft;
                nextAppointment.reschedule_unavailable_reason = !isConfirmed
                    ? "Esta cita ya no está confirmada, por eso no se puede reprogramar."
                    : !hasEnoughNotice
                      ? "Para reprogramar una cita deben faltar más de 24 horas para su inicio."
                      : !hasReschedulesLeft
                        ? "Esta cita ya alcanzó el máximo de 3 reprogramaciones."
                        : "Esta cita no está disponible para reprogramación.";
            }

            return res.render("patient/dashboard", {
                pageTitle: "Panel del paciente | SaludVital",
                activeNav: "home",
                patientName: patient ? `${patient.first_name} ${patient.last_name}` : "Paciente",
                nextAppointment,
            });
        } catch (error) {
            return next(error);
        }
    },
);

// Render the authenticated patient's appointment history and upcoming visits.
patientRoutes.get(
    "/patient/appointments",
    authenticateToken,
    requireRole("Patient"),
    async (req, res, next) => {
        try {
            const patient = await PatientModel.findOne({
                where: { user_id: req.auth.userId },
                attributes: ["id", "first_name", "last_name"],
            });
            const storedAppointments = patient
                ? await Appointment.findAll({
                      where: { patient_id: patient.id },
                      include: [
                          { model: Doctor, as: "doctor" },
                          { model: Specialities, as: "specialty", attributes: ["name"] },
                          { model: AppointmentStatus, as: "status", attributes: ["name"] },
                          {
                              model: AppointmentHistory,
                              as: "history",
                              attributes: [
                                  "event_type",
                                  "previous_values",
                                  "new_values",
                                  "occurred_at",
                              ],
                          },
                      ],
                      order: [["start_at", "DESC"]],
                  })
                : [];
            const previewMode = process.env.NODE_ENV !== "production" && req.query.preview === "1";
            const previewAppointments = [
                {
                    id: "demo-1",
                    start_at: "2026-11-15T15:00:00.000Z",
                    status: { name: "Confirmed" },
                    specialty: { name: "Medicina General" },
                    doctor_label: "Dr. Carlos Ramírez",
                    site_label: "Sede Dosquebradas",
                },
                {
                    id: "demo-2",
                    start_at: "2026-11-20T13:00:00.000Z",
                    status: { name: "In Progress" },
                    specialty: { name: "Dermatología" },
                    doctor_label: "Dra. Ana Torres",
                    site_label: "Sede Dosquebradas",
                },
                {
                    id: "demo-3",
                    start_at: "2026-09-03T13:00:00.000Z",
                    status: { name: "Attended" },
                    specialty: { name: "Oftalmología" },
                    doctor_label: "Dr. Luis Gómez",
                    site_label: "Sede Pereira",
                },
                {
                    id: "demo-4",
                    start_at: "2026-08-12T15:00:00.000Z",
                    status: { name: "Cancelled" },
                    specialty: { name: "Cardiología" },
                    doctor_label: "Dr. Andrés Silva",
                    site_label: "Sede Pereira",
                },
                {
                    id: "demo-5",
                    start_at: "2026-12-05T16:00:00.000Z",
                    status: { name: "Confirmed" },
                    specialty: { name: "Pediatría" },
                    doctor_label: "Dra. Laura Vélez",
                    site_label: "Sede Dosquebradas",
                },
            ];
            const appointments = (previewMode ? previewAppointments : storedAppointments).map(
                (item) => {
                    const appointment =
                        typeof item.get === "function" ? item.get({ plain: true }) : item;
                    appointment.history = (appointment.history || [])
                        .filter((event) => ["Rescheduled", "Cancelled"].includes(event.event_type))
                        .sort(
                            (first, second) =>
                                new Date(first.occurred_at).getTime() -
                                new Date(second.occurred_at).getTime(),
                        );
                    return appointment;
                },
            );
            return res.render("patient/appointments", {
                pageTitle: "Mis citas | SaludVital",
                activeNav: "appointments",
                appointments,
                appointmentStats,
                specialties: [
                    ...new Set(appointments.map((item) => item.specialty?.name).filter(Boolean)),
                ],
                patientName: patient?.first_name
                    ? `${patient.first_name} ${patient.last_name}`
                    : "Paciente",
                previewMode,
                previewAvailable: process.env.NODE_ENV !== "production",
            });
        } catch (error) {
            return next(error);
        }
    },
);

// Render the patient appointment booking interface.
patientRoutes.get(
    "/patient/appointments/new",
    authenticateToken,
    requireRole("Patient"),
    async (req, res, next) => {
        try {
            return res.render("patient/request-appointment", {
                pageTitle: "Pedir una nueva cita | SaludVital",
                activeNav: "book",
                patientName: await getPatientName(req.auth.userId),
            });
        } catch (error) {
            return next(error);
        }
    },
);

patientRoutes.get(
    "/patient/appointments/reschedule",
    authenticateToken,
    requireRole("Patient"),
    async (req, res, next) => {
        try {
            const appointments = (await getReschedulableAppointments(req.auth.userId)).map((item) =>
                item.get({ plain: true }),
            );
            const requestedAppointmentId = Number(req.query.appointmentId);
            const selectedAppointmentId = appointments.some(
                (appointment) => appointment.id === requestedAppointmentId,
            )
                ? requestedAppointmentId
                : appointments[0]?.id;

            return res.render("patient/reschedule-appointment", {
                pageTitle: "Reprogramar cita | SaludVital",
                activeNav: "reschedule",
                patientName: await getPatientName(req.auth.userId),
                appointments,
                selectedAppointmentId,
            });
        } catch (error) {
            return next(error);
        }
    },
);

patientRoutes.get(
    "/patient/notifications",
    authenticateToken,
    requireRole("Patient"),
    async (req, res, next) => {
        try {
            const notificationSettings = await getPatientNotificationSettings(req.auth.userId);
            return res.render("patient/notifications", {
                pageTitle: "Notificaciones | SaludVital",
                activeNav: "notifications",
                welcomeMessage: "Configura tus notificaciones y mantente siempre informado.",
                patientName: notificationSettings.patient
                    ? `${notificationSettings.patient.first_name} ${notificationSettings.patient.last_name}`
                    : await getPatientName(req.auth.userId),
                notificationEvents,
                ...notificationSettings,
            });
        } catch (error) {
            return next(error);
        }
    },
);

patientRoutes.get(
    "/patient/clinical-history",
    authenticateToken,
    requireRole("Patient"),
    async (req, res, next) => {
        try {
            const previewMode = process.env.NODE_ENV !== "production" && req.query.preview === "1";
            const sampleConsultations = [
                {
                    id: "demo-1",
                    started_at: "2026-10-15T13:00:00.000Z",
                    date_label: "15 oct 2026",
                    time_label: "08:00 a. m. - 08:30 a. m.",
                    specialty_label: "Medicina General",
                    doctor_label: "Dra. Laura Vélez",
                    symptoms: "Dolor abdominal leve y malestar general.",
                    clinical_notes:
                        "Paciente en buen estado general. Se recomienda seguimiento y cambios en la alimentación.",
                    vital_signs: {
                        blood_pressure: "120/80 mmHg",
                        heart_rate: "72 lpm",
                        temperature: "36.5 °C",
                        weight: "68 kg",
                        height: "1.70 m",
                        bmi: "23.5",
                    },
                    diagnoses: [{ diagnosis: "Gastritis leve", notes: "Control en tres meses." }],
                    prescriptions: [
                        {
                            items: [
                                {
                                    medication_name: "Omeprazol",
                                    dosage: "20 mg",
                                    frequency: "Una vez al día",
                                    duration: "14 días",
                                    instructions: "Tomar antes del desayuno.",
                                },
                            ],
                        },
                    ],
                    documents: ["Resumen de atención", "Orden médica"],
                },
                {
                    id: "demo-2",
                    started_at: "2026-09-12T14:00:00.000Z",
                    date_label: "12 sep 2026",
                    time_label: "09:00 a. m. - 09:30 a. m.",
                    specialty_label: "Odontología",
                    doctor_label: "Dr. Andrés Torres",
                    symptoms: "Sensibilidad dental al frío.",
                    clinical_notes:
                        "Se realiza valoración odontológica y se indica higiene oral diaria.",
                    vital_signs: {},
                    diagnoses: [{ diagnosis: "Hipersensibilidad dental", notes: "" }],
                    prescriptions: [
                        {
                            items: [
                                {
                                    medication_name: "Flúor tópico",
                                    dosage: "Aplicación local",
                                    frequency: "Una vez",
                                    duration: "Según valoración",
                                    instructions: "Uso profesional en consulta.",
                                },
                            ],
                        },
                    ],
                    documents: ["Registro odontológico"],
                },
                {
                    id: "demo-3",
                    started_at: "2026-08-18T15:00:00.000Z",
                    date_label: "18 ago 2026",
                    time_label: "10:00 a. m. - 10:30 a. m.",
                    specialty_label: "Cardiología",
                    doctor_label: "Dra. Camila Rojas",
                    symptoms: "Control preventivo.",
                    clinical_notes: "Signos vitales estables. Continuar hábitos saludables.",
                    vital_signs: { blood_pressure: "118/78 mmHg", heart_rate: "70 lpm" },
                    diagnoses: [
                        { diagnosis: "Control cardiovascular", notes: "Sin hallazgos de alarma." },
                    ],
                    prescriptions: [],
                    documents: ["Resultado de electrocardiograma"],
                },
                {
                    id: "demo-4",
                    started_at: "2026-07-10T16:00:00.000Z",
                    date_label: "10 jul 2026",
                    time_label: "11:00 a. m. - 11:30 a. m.",
                    specialty_label: "Neumología",
                    doctor_label: "Dr. Felipe Díaz",
                    symptoms: "Tos ocasional sin fiebre.",
                    clinical_notes: "Evaluación respiratoria sin signos de dificultad.",
                    vital_signs: { temperature: "36.7 °C", oxygen_saturation: "98 %" },
                    diagnoses: [],
                    prescriptions: [
                        {
                            items: [
                                {
                                    medication_name: "Solución salina",
                                    dosage: "0.9 %",
                                    frequency: "Según necesidad",
                                    duration: "7 días",
                                    instructions: "Usar según indicación médica.",
                                },
                            ],
                        },
                    ],
                    documents: ["Indicaciones de cuidado"],
                },
                {
                    id: "demo-5",
                    started_at: "2026-06-05T13:00:00.000Z",
                    date_label: "05 jun 2026",
                    time_label: "08:00 a. m. - 08:30 a. m.",
                    specialty_label: "Medicina General",
                    doctor_label: "Dra. Laura Vélez",
                    symptoms: "Consulta de control general.",
                    clinical_notes: "Se revisan antecedentes y se mantiene el plan de cuidado.",
                    vital_signs: {},
                    diagnoses: [],
                    prescriptions: [
                        {
                            items: [
                                {
                                    medication_name: "Vitamina D",
                                    dosage: "1000 UI",
                                    frequency: "Una vez al día",
                                    duration: "30 días",
                                    instructions: "Tomar con alimentos.",
                                },
                            ],
                        },
                    ],
                    documents: ["Resumen de atención"],
                },
            ];
            const consultations = previewMode
                ? sampleConsultations
                : await getPatientClinicalHistory(req.auth.userId);
            const totals = consultations.reduce(
                (counts, consultation) => {
                    counts.diagnoses += consultation.diagnoses.length;
                    counts.treatments += consultation.prescriptions.reduce(
                        (prescriptionCount, prescription) =>
                            prescriptionCount + (prescription.items?.length || 0),
                        0,
                    );
                    counts.documents += consultation.documents?.length || 0;
                    return counts;
                },
                { diagnoses: 0, treatments: 0, documents: 0 },
            );

            return res.render("patient/clinical-history", {
                pageTitle: "Historial clínico | SaludVital",
                activeNav: "clinical-history",
                welcomeMessage: "Aquí puedes consultar el registro de tus atenciones médicas.",
                patientName: await getPatientName(req.auth.userId),
                consultations,
                totals: { consultations: consultations.length, ...totals },
                previewMode,
                previewAvailable: process.env.NODE_ENV !== "production",
            });
        } catch (error) {
            return next(error);
        }
    },
);

patientRoutes.get(
    "/patient/profile",
    authenticateToken,
    requireRole("Patient"),
    async (req, res, next) => {
        try {
            const profile = await getPatientProfile(req.auth.userId);
            const departments = getDepartments();
            const currentDepartment = departments.find(
                (department) => department.name === profile.patient.department,
            );
            return res.render("patient/profile", {
                pageTitle: "Mi perfil | SaludVital",
                activeNav: "profile",
                welcomeMessage:
                    "Aquí puedes gestionar tu perfil y mantener tu información actualizada.",
                patientName: `${profile.patient.first_name} ${profile.patient.last_name}`,
                ...profile,
                departments,
                currentDepartmentCode: currentDepartment?.code || "",
                municipalities: currentDepartment ? getMunicipalities(currentDepartment.code) : [],
            });
        } catch (error) {
            return next(error);
        }
    },
);

export default patientRoutes;
