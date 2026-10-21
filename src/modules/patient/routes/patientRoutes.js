import { Router } from "express";
import { authenticateToken, requireRole } from "../../../middleware/authenticateToken.js";
import {
    listAvailableSpecialties,
    listAvailableDoctors,
    listAvailableTimeSlots,
    createPatientAppointment,
    listReschedulableAppointments,
    updatePatientAppointmentTime,
} from "../controllers/appointmentController.js";
import { Patient } from "../../../models/associations.js";
import { getReschedulableAppointments } from "../services/appointmentService.js";

// Define the routes available to patients.
const patientRoutes = Router();

async function getPatientName(userId) {
    const patient = await Patient.findOne({
        where: { user_id: userId },
        attributes: ["first_name", "last_name"],
    });
    return patient ? `${patient.first_name} ${patient.last_name}` : "Paciente";
}

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
            return res.render("patient/dashboard", {
                pageTitle: "Panel del paciente | SaludVital",
                activeNav: "home",
                patientName: await getPatientName(req.auth.userId),
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
            return res.render("patient/reschedule-appointment", {
                pageTitle: "Reprogramar cita | SaludVital",
                activeNav: "reschedule",
                patientName: await getPatientName(req.auth.userId),
                appointments: (await getReschedulableAppointments(req.auth.userId)).map((item) =>
                    item.get({ plain: true }),
                ),
            });
        } catch (error) {
            return next(error);
        }
    },
);

export default patientRoutes;
