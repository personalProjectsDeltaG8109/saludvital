import { Router } from "express";
import {
    createAdminDoctor,
    getActiveDoctorSpecialties,
    getAdminDoctorDetails,
    getAdminDoctors,
    getAdminDoctorStatusImpact,
    updateAdminDoctorStatus,
} from "../services/adminDoctorService.js";

// Receive the shared middleware so doctor routes keep the same access checks.
export default function createAdminDoctorRoutes(requireAdministrator) {
    const doctorRoutes = Router();

    doctorRoutes.get("/api/admin/doctors", ...requireAdministrator, async (req, res, next) => {
        try {
            return res.json(await getAdminDoctors(req.query));
        } catch (error) {
            if (error.statusCode) {
                return res.status(error.statusCode).json({ message: error.message });
            }
            return next(error);
        }
    });

    doctorRoutes.get(
        "/api/admin/doctors/:doctorId/status-impact",
        ...requireAdministrator,
        async (req, res, next) => {
            try {
                return res.json(await getAdminDoctorStatusImpact(req.params.doctorId));
            } catch (error) {
                if (error.statusCode) {
                    return res.status(error.statusCode).json({ message: error.message });
                }
                return next(error);
            }
        },
    );

    doctorRoutes.patch(
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
                if (error.statusCode) {
                    return res.status(error.statusCode).json({ message: error.message });
                }
                return next(error);
            }
        },
    );

    doctorRoutes.get(
        "/api/admin/doctors/:doctorId",
        ...requireAdministrator,
        async (req, res, next) => {
            try {
                return res.json(await getAdminDoctorDetails(req.params.doctorId));
            } catch (error) {
                if (error.statusCode) {
                    return res.status(error.statusCode).json({ message: error.message });
                }
                return next(error);
            }
        },
    );

    doctorRoutes.post("/api/admin/doctors", ...requireAdministrator, async (req, res, next) => {
        try {
            return res.status(201).json(await createAdminDoctor(req.auth.userId, req.body));
        } catch (error) {
            if (error.statusCode) {
                return res.status(error.statusCode).json({ message: error.message });
            }
            return next(error);
        }
    });

    doctorRoutes.get("/admin/doctors", ...requireAdministrator, (_req, res) => {
        return res.render("admin/doctors", {
            pageTitle: "Médicos | SaludVital",
            adminName: "Administrador",
        });
    });

    doctorRoutes.get("/admin/doctors/new", ...requireAdministrator, async (_req, res) => {
        return res.render("admin/doctor-form", {
            pageTitle: "Crear médico | SaludVital",
            adminName: "Administrador",
            specialties: await getActiveDoctorSpecialties(),
            formAction: "/api/admin/doctors",
        });
    });

    doctorRoutes.get(
        "/admin/doctors/:doctorId",
        ...requireAdministrator,
        async (req, res, next) => {
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
        },
    );

    return doctorRoutes;
}
