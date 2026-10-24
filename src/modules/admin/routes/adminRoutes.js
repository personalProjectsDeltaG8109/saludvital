import { Router } from "express";
import { authenticateToken, requireRole } from "../../../middleware/authenticateToken.js";
import { getAdminDashboardData } from "../services/adminDashboardService.js";
import {
    getAdminDepartments,
    getAdminMunicipalities,
    getAdminUserDetails,
    getAdminUsers,
    updateAdminUser,
    updateAdminUserProfile,
} from "../services/adminUserManagementService.js";
import { getAdminWhatsAppData } from "../services/adminWhatsAppService.js";

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

adminRoutes.get("/api/admin/users", ...requireAdministrator, async (req, res, next) => {
    try {
        return res.json(await getAdminUsers(req.query));
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    }
});

adminRoutes.patch("/api/admin/users/:userId", ...requireAdministrator, async (req, res, next) => {
    try {
        return res.json(await updateAdminUser(req.auth.userId, req.params.userId, req.body));
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    }
});

adminRoutes.get("/api/admin/users/:userId", ...requireAdministrator, async (req, res, next) => {
    try {
        return res.json(await getAdminUserDetails(req.params.userId));
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    }
});

adminRoutes.patch(
    "/api/admin/users/:userId/profile",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            return res.json(
                await updateAdminUserProfile(req.auth.userId, req.params.userId, req.body),
            );
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);

adminRoutes.get(
    "/api/admin/locations/departments",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            return res.json(await getAdminDepartments());
        } catch (error) {
            return next(error);
        }
    },
);

adminRoutes.get(
    "/api/admin/locations/municipalities",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            return res.json(await getAdminMunicipalities(req.query.departmentCode));
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);

adminRoutes.get("/api/admin/whatsapp", ...requireAdministrator, async (req, res, next) => {
    try {
        return res.json(await getAdminWhatsAppData(req.query));
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        return next(error);
    }
});

// Render read-only WhatsApp monitoring data for administrators.
adminRoutes.get("/admin/whatsapp", ...requireAdministrator, async (req, res, next) => {
    try {
        const whatsapp = await getAdminWhatsAppData(req.query);
        return res.render("admin/whatsapp", {
            pageTitle: "WhatsApp y chatbot | SaludVital",
            adminName: "Administrador",
            whatsapp,
        });
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).send(error.message);
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

// Render the role-protected user account management page.
adminRoutes.get("/admin/users", ...requireAdministrator, async (req, res, next) => {
    try {
        const userData = await getAdminUsers(req.query);
        return res.render("admin/users", {
            pageTitle: "Usuarios y roles | SaludVital",
            adminName: "Administrador",
            userData,
        });
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).send(error.message);
        return next(error);
    }
});

export default adminRoutes;
