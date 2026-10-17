import { Router } from "express";
import { authenticateToken, requireRole } from "../../../middleware/authenticateToken.js";

// Define the routes available to administrators.
const adminRoutes = Router();

// Protect the verification page with authentication and role authorization.
adminRoutes.get("/admin/dashboard", authenticateToken, requireRole("Administrator"), (req, res) => {
    return res.render("admin/dashboard", {
        pageTitle: "Administrator verification | SaludVital",
        role: req.auth.role,
    });
});

export default adminRoutes;
