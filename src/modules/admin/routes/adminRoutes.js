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
import {
    createAdminSpecialty,
    getAdminSpecialties,
    getAdminSpecialtyForEdit,
    updateAdminSpecialty,
} from "../services/adminSpecialtyService.js";
import {
    createAdminDoctor,
    getActiveDoctorSpecialties,
    getAdminDoctorDetails,
    getAdminDoctors,
    getAdminDoctorStatusImpact,
    updateAdminDoctorStatus,
} from "../services/adminDoctorService.js";

// Define the routes available to administrators.
const adminRoutes = Router();

const requireAdministrator = [authenticateToken, requireRole("Administrator")];

adminRoutes.get("/api/admin/specialties", ...requireAdministrator, async (req, res, next) => {
    try {
        return res.json(await getAdminSpecialties(req.query));
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    }
});
adminRoutes.post("/api/admin/specialties", ...requireAdministrator, async (req, res, next) => {
    try {
        const specialty = await createAdminSpecialty(req.body);
        return res.status(201).json({ specialty });
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    }
});
adminRoutes.patch(
    "/api/admin/specialties/:specialtyId",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            const specialty = await updateAdminSpecialty(
                req.auth.userId,
                req.params.specialtyId,
                req.body,
            );
            return res.json({ specialty });
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);

adminRoutes.get("/api/admin/doctors", ...requireAdministrator, async (req, res, next) => {
    try {
        return res.json(await getAdminDoctors(req.query));
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    }
});
adminRoutes.get(
    "/api/admin/doctors/:doctorId/status-impact",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            return res.json(await getAdminDoctorStatusImpact(req.params.doctorId));
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);
adminRoutes.patch(
    "/api/admin/doctors/:doctorId/status",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            return res.json(
                await updateAdminDoctorStatus(
                    req.auth.userId,
                    req.params.doctorId,
                    req.body?.isActive,
                ),
            );
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);
adminRoutes.get("/api/admin/doctors/:doctorId", ...requireAdministrator, async (req, res, next) => {
    try {
        return res.json(await getAdminDoctorDetails(req.params.doctorId));
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    }
});
adminRoutes.post("/api/admin/doctors", ...requireAdministrator, async (req, res, next) => {
    try {
        return res.status(201).json(await createAdminDoctor(req.auth.userId, req.body));
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    }
});
adminRoutes.get("/admin/doctors", ...requireAdministrator, async (_req, res, next) => {
    try {
        return res.render("admin/doctors", {
            pageTitle: "Médicos | SaludVital",
            adminName: "Administrador",
        });
    } catch (error) {
        return next(error);
    }
});
adminRoutes.get("/admin/specialties", ...requireAdministrator, (_req, res) => {
    return res.render("admin/specialties", {
        pageTitle: "Especialidades | SaludVital",
        adminName: "Administrador",
    });
});
adminRoutes.get("/admin/specialties/new", ...requireAdministrator, (_req, res) => {
    return res.render("admin/specialty-form", {
        pageTitle: "Nueva especialidad | SaludVital",
        adminName: "Administrador",
    });
});
adminRoutes.get(
    "/admin/specialties/:specialtyId/edit",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            const specialty = await getAdminSpecialtyForEdit(req.params.specialtyId);
            return res.render("admin/specialty-form", {
                pageTitle: `Editar ${specialty.name} | SaludVital`,
                adminName: "Administrador",
                specialty,
            });
        } catch (error) {
            if (error.statusCode === 404) {
                return res.status(404).render("errors/404", {
                    pageTitle: "Especialidad no encontrada | SaludVital",
                    homeHref: "/admin/specialties",
                    appointmentsHref: null,
                    supportHref:
                        "https://wa.me/573137498332?text=Hola%2C%20quisiera%20recibir%20informaci%C3%B3n%20sobre%20SaludVital.",
                });
            }
            return next(error);
        }
    },
);
adminRoutes.get("/admin/doctors/new", ...requireAdministrator, async (_req, res) => {
    return res.render("admin/doctor-form", {
        pageTitle: "Crear médico | SaludVital",
        adminName: "Administrador",
        specialties: await getActiveDoctorSpecialties(),
        formAction: "/api/admin/doctors",
    });
});
adminRoutes.get("/admin/doctors/:doctorId", ...requireAdministrator, async (req, res, next) => {
    try {
        const doctor = await getAdminDoctorDetails(req.params.doctorId);
        return res.render("admin/doctor-details", {
            pageTitle: `${doctor.name} | Médicos SaludVital`,
            adminName: "Administrador",
            doctor,
        });
    } catch (error) {
        if (error.statusCode === 404) {
            return res.status(404).render("errors/404", {
                pageTitle: "Médico no encontrado | SaludVital",
                homeHref: "/admin/doctors",
                appointmentsHref: null,
                supportHref:
                    "https://wa.me/573137498332?text=Hola%2C%20quisiera%20recibir%20informaci%C3%B3n%20sobre%20SaludVital.",
            });
        }
        return next(error);
    }
});
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
