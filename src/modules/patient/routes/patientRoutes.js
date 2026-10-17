import { Router } from "express";
import { authenticateToken, requireRole } from "../../../middleware/authenticateToken.js";

// Define the routes available to patients.
const patientRoutes = Router();

// Protect the verification page with authentication and role authorization.
patientRoutes.get("/patient/dashboard", authenticateToken, requireRole("Patient"), (req, res) => {
    return res.render("patient/dashboard", {
        pageTitle: "Patient verification | SaludVital",
        role: req.auth.role,
    });
});

export default patientRoutes;
