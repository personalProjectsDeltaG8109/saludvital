import { Router } from "express";
import { authenticateToken, requireRole } from "../../../middleware/authenticateToken.js";
import {
    getDoctorActivePatients,
    getDoctorAppointments,
    getDoctorDashboardData,
} from "../services/doctorDashboardService.js";

const doctorRoutes = Router();
const requireDoctor = [authenticateToken, requireRole("Doctor")];

doctorRoutes.get("/api/doctor/appointments", ...requireDoctor, async (req, res, next) => {
    try {
        const appointmentsData = await getDoctorAppointments(req.auth.userId, req.query);
        if (!appointmentsData) {
            return res.status(404).json({ message: "No se encontró el perfil médico." });
        }

        return res.json(appointmentsData);
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        return next(error);
    }
});

doctorRoutes.get("/doctor/dashboard", ...requireDoctor, async (req, res, next) => {
    try {
        const dashboard = await getDoctorDashboardData(req.auth.userId);
        if (!dashboard) return res.status(404).send("No se encontró el perfil médico.");

        return res.render("doctor/dashboard", {
            pageTitle: "Inicio | SaludVital",
            activeNav: "home",
            averageDurationLabel:
                dashboard.metrics.averageDurationSeconds === null
                    ? "Sin datos"
                    : `${Math.round(dashboard.metrics.averageDurationSeconds / 60)} min`,
            ...dashboard,
        });
    } catch (error) {
        return next(error);
    }
});

doctorRoutes.get(
    ["/doctor/appointments", "/doctor/agenda"],
    ...requireDoctor,
    async (req, res, next) => {
        try {
            const dashboard = await getDoctorAppointments(req.auth.userId, req.query);
            if (!dashboard) return res.status(404).send("No se encontró el perfil médico.");

            return res.render("doctor/appointments", {
                pageTitle:
                    req.path === "/doctor/agenda"
                        ? "Agenda | SaludVital"
                        : "Mis citas | SaludVital",
                activeNav: req.path === "/doctor/agenda" ? "agenda" : "appointments",
                bottomNavActive: "appointments",
                appointmentsPath: req.path,
                ...dashboard,
            });
        } catch (error) {
            return next(error);
        }
    },
);

doctorRoutes.get("/doctor/patients", ...requireDoctor, async (req, res, next) => {
    try {
        const dashboard = await getDoctorActivePatients(req.auth.userId);
        if (!dashboard) return res.status(404).send("No se encontró el perfil médico.");

        return res.render("doctor/patients", {
            pageTitle: "Pacientes activos | SaludVital",
            activeNav: "patients",
            ...dashboard,
        });
    } catch (error) {
        return next(error);
    }
});

export default doctorRoutes;
