import { Router } from "express";
import { authenticateToken, requireRole } from "../../../middleware/authenticateToken.js";
import {
    getDoctorActivePatients,
    getDoctorAppointments,
    getDoctorDashboardData,
} from "../services/doctorDashboardService.js";

const doctorRoutes = Router();
const requireDoctor = [authenticateToken, requireRole("Doctor")];

doctorRoutes.get("/doctor/dashboard", ...requireDoctor, async (req, res, next) => {
    try {
        const dashboard = await getDoctorDashboardData(req.auth.userId);
        if (!dashboard) return res.status(404).send("No se encontró el perfil médico.");

        return res.render("doctor/dashboard", {
            pageTitle: "Inicio | SaludVital",
            activeNav: "home",
            ...dashboard,
        });
    } catch (error) {
        return next(error);
    }
});

doctorRoutes.get("/doctor/appointments", ...requireDoctor, async (req, res, next) => {
    try {
        const appointments = await getDoctorAppointments(req.auth.userId);
        if (!appointments) return res.status(404).send("No se encontró el perfil médico.");

        return res.render("doctor/appointments", {
            pageTitle: "Mis citas | SaludVital",
            activeNav: "appointments",
            appointments,
        });
    } catch (error) {
        return next(error);
    }
});

doctorRoutes.get("/doctor/patients", ...requireDoctor, async (req, res, next) => {
    try {
        const patients = await getDoctorActivePatients(req.auth.userId);
        if (!patients) return res.status(404).send("No se encontró el perfil médico.");

        return res.render("doctor/patients", {
            pageTitle: "Pacientes activos | SaludVital",
            activeNav: "patients",
            patients,
        });
    } catch (error) {
        return next(error);
    }
});

export default doctorRoutes;
