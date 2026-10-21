import { Router } from "express";
import { authenticateToken, requireRole } from "../../../middleware/authenticateToken.js";
import {
    listAvailableSpecialties,
    listAvailableDoctors,
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

// Create an appointment for the authenticated patient.
patientRoutes.post(
    "/api/patient/appointments",
    authenticateToken,
    requireRole("Patient"),
    createPatientAppointment,
);
// Protect the verification page with authentication and role authorization.
patientRoutes.get("/patient/dashboard", authenticateToken, requireRole("Patient"), (req, res) => {
    return res.render("patient/dashboard", {
        pageTitle: "Patient verification | SaludVital",
        role: req.auth.role,
    });
});

export default patientRoutes;
