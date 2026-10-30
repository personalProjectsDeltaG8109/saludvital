import { Router } from "express";
import { authenticateToken, requireRole } from "../../../middleware/authenticateToken.js";
import {
    getDoctorAppointments,
    getDoctorDashboardData,
    getDoctorNextAppointmentData,
} from "../services/doctorDashboardService.js";
import {
    getDoctorHeaderData,
    getDoctorPatientDetails,
    getDoctorPatients,
    getDoctorPatientsPage,
} from "../services/doctorPatientsService.js";
import {
    completeDoctorConsultation,
    getDoctorConsultation,
    saveDoctorConsultationDraft,
    startDoctorConsultation,
} from "../services/doctorConsultationService.js";
import {
    getCurrentDoctorAgendaDate,
    getDoctorAgendaViewData,
} from "../services/doctorAgendaService.js";

const doctorRoutes = Router();
const requireDoctor = [authenticateToken, requireRole("Doctor")];

doctorRoutes.get(
    "/api/doctor/consultations/:consultationId",
    ...requireDoctor,
    async (req, res, next) => {
        try {
            return res.json(
                await getDoctorConsultation(req.auth.userId, req.params.consultationId),
            );
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);

doctorRoutes.put(
    "/api/doctor/consultations/:consultationId/draft",
    ...requireDoctor,
    async (req, res, next) => {
        try {
            return res.json(
                await saveDoctorConsultationDraft(
                    req.auth.userId,
                    req.params.consultationId,
                    req.body,
                ),
            );
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);

doctorRoutes.post(
    "/api/doctor/consultations/:consultationId/complete",
    ...requireDoctor,
    async (req, res, next) => {
        try {
            return res.json(
                await completeDoctorConsultation(
                    req.auth.userId,
                    req.params.consultationId,
                    req.body,
                ),
            );
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);

doctorRoutes.get(
    "/doctor/consultations/:consultationId",
    ...requireDoctor,
    async (req, res, next) => {
        try {
            const consultation = await getDoctorConsultation(
                req.auth.userId,
                req.params.consultationId,
            );
            return res.render("doctor/consultation", {
                pageTitle: "Consulta médica | SaludVital",
                activeNav: "appointments",
                consultation,
                patient: consultation.appointment?.patient,
                appointment: consultation.appointment,
                doctorName: consultation.doctor?.display_name || "Médico",
                doctorPhotoUrl: consultation.doctor?.profile_photo_url || null,
            });
        } catch (error) {
            if (error.statusCode) return res.status(error.statusCode).send(error.message);
            return next(error);
        }
    },
);

doctorRoutes.post(
    "/api/doctor/appointments/:appointmentId/start",
    ...requireDoctor,
    async (req, res, next) => {
        try {
            const result = await startDoctorConsultation(req.auth.userId, req.params.appointmentId);
            return res.status(201).json(result);
        } catch (error) {
            if (error.statusCode) {
                return res.status(error.statusCode).json({ message: error.message });
            }
            return next(error);
        }
    },
);

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

doctorRoutes.get("/api/doctor/agenda", ...requireDoctor, async (req, res, next) => {
    try {
        const [agenda, nextAppointment] = await Promise.all([
            getDoctorAgendaViewData(req.auth.userId, req.query.view, req.query.date),
            getDoctorNextAppointmentData(req.auth.userId),
        ]);
        if (!agenda) return res.status(404).json({ message: "No se encontró el perfil médico." });
        return res.json({ ...agenda, nextAppointment });
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
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

doctorRoutes.get("/doctor/appointments", ...requireDoctor, async (req, res, next) => {
    try {
        const dashboard = await getDoctorAppointments(req.auth.userId, req.query);
        if (!dashboard) return res.status(404).send("No se encontró el perfil médico.");

        return res.render("doctor/appointments", {
            pageTitle: "Mis citas | SaludVital",
            activeNav: "appointments",
            bottomNavActive: "appointments",
            appointmentsPath: req.path,
            ...dashboard,
        });
    } catch (error) {
        return next(error);
    }
});

doctorRoutes.get("/doctor/agenda", ...requireDoctor, async (req, res, next) => {
    try {
        const doctorHeader = await getDoctorHeaderData(req.auth.userId);
        if (!doctorHeader) return res.status(404).send("No se encontró el perfil médico.");
        return res.render("doctor/agenda", {
            pageTitle: "Mi agenda | SaludVital",
            activeNav: "agenda",
            bottomNavActive: "agenda",
            todayDate: getCurrentDoctorAgendaDate(),
            initialDate:
                typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
                    ? req.query.date
                    : getCurrentDoctorAgendaDate(),
            initialView: ["day", "week", "month"].includes(req.query.view) ? req.query.view : "day",
            ...doctorHeader,
        });
    } catch (error) {
        return next(error);
    }
});

doctorRoutes.get("/api/doctor/patients", ...requireDoctor, async (req, res, next) => {
    try {
        return res.json(await getDoctorPatients(req.auth.userId, req.query));
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    }
});

doctorRoutes.get("/api/doctor/patients/:patientId", ...requireDoctor, async (req, res, next) => {
    try {
        return res.json(await getDoctorPatientDetails(req.auth.userId, req.params.patientId));
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    }
});

doctorRoutes.get("/doctor/patients", ...requireDoctor, async (req, res, next) => {
    try {
        const [patientsData, doctorHeader] = await Promise.all([
            getDoctorPatientsPage(req.auth.userId, req.query),
            getDoctorHeaderData(req.auth.userId),
        ]);

        return res.render("doctor/patients", {
            pageTitle: "Pacientes | SaludVital",
            activeNav: "patients",
            ...doctorHeader,
            ...patientsData,
        });
    } catch (error) {
        return next(error);
    }
});

export default doctorRoutes;
