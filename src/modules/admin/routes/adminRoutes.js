import { Router } from "express";
import { authenticateToken, requireRole } from "../../../middleware/authenticateToken.js";
import { getAdminDashboardData } from "../services/adminDashboardService.js";

// Define the routes available to administrators.
const adminRoutes = Router();

const requireAdministrator = [authenticateToken, requireRole("Administrator")];

adminRoutes.get("/api/admin/dashboard", ...requireAdministrator, async (req, res, next) => {
    try {
        return res.json(await getAdminDashboardData(req.query));
    } catch (error) {
        return next(error);
    }
});

// Render the administrator dashboard with live, role-protected aggregates.
adminRoutes.get("/admin/dashboard", ...requireAdministrator, async (req, res, next) => {
    try {
        const dashboard = await getAdminDashboardData(req.query);
        return res.render("admin/dashboard", {
            pageTitle: "Panel administrativo | SaludVital",
            adminName: "Administrador",
            dashboard,
        });
    } catch (error) {
        return next(error);
    }
});

export default adminRoutes;
