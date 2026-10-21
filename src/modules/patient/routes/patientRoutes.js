import { Router } from "express";
import { authenticateToken, requireRole } from "../../../middleware/authenticateToken.js";
import {
    Appointment,
    Patient,
    Doctor,
    Specialities,
    AppointmentStatus,
} from "../../../models/associations.js";
import {
    listAvailableSpecialties,
    listAvailableDoctors,
    listAvailableTimeSlots,
    createPatientAppointment,
} from "../controllers/appointmentController.js";

// Define the routes available to patients.
const patientRoutes = Router();

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
// Render the patient dashboard with authentication and role authorization.
patientRoutes.get("/patient/dashboard", authenticateToken, requireRole("Patient"), (req, res) => {
    return res.render("patient/dashboard", {
        pageTitle: "Panel del paciente | SaludVital",
        activeNav: "home",
    });
});

// Render the authenticated patient's appointment history and upcoming visits.
patientRoutes.get(
    "/patient/appointments",
    authenticateToken,
    requireRole("Patient"),
    async (req, res, next) => {
        try {
            const patient = await Patient.findOne({
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
                      ],
                      order: [["start_at", "DESC"]],
                  })
                : [];
            const previewMode = process.env.NODE_ENV !== "production" && req.query.preview === "1";
            const previewAppointments = [
                {
                    id: "demo-1",
                    start_at: "2026-11-15T15:00:00.000Z",
                    status: { name: "Pending" },
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
                    status: { name: "Completed" },
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
                    status: { name: "Pending" },
                    specialty: { name: "Pediatría" },
                    doctor_label: "Dra. Laura Vélez",
                    site_label: "Sede Dosquebradas",
                },
            ];
            const appointments = (previewMode ? previewAppointments : storedAppointments).map(
                (item) => (typeof item.get === "function" ? item.get({ plain: true }) : item),
            );
            return res.render("patient/appointments", {
                pageTitle: "Mis citas | SaludVital",
                activeNav: "appointments",
                appointments,
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
    (req, res) => {
        return res.render("patient/request-appointment", {
            pageTitle: "Pedir una nueva cita | SaludVital",
            activeNav: "book",
        });
    },
);

export default patientRoutes;
