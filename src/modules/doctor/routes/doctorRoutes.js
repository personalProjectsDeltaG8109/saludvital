
import { Router } from "express";
import {
    authenticateToken,
    requireRole,
} from "../../../middleware/authenticateToken.js";

// Define the routes available to doctors.
const doctorRoutes = Router();

// Protect the verification page with authentication and role authorization.
doctorRoutes.get(
    "/doctor/dashboard",
    authenticateToken,
    requireRole("Doctor"),
    (req, res) => {
        return res.render("doctor/dashboard", {
            pageTitle: "Doctor verification | SaludVital",
            role: req.auth.role,
        });
    },
);

export default doctorRoutes;
