import { Router } from "express";
import { authenticateToken, requireRole } from "../../../middleware/authenticateToken.js";
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
