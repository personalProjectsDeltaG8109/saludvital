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
    getActiveDoctorConsultationId,
    getDoctorConsultation,
    saveDoctorConsultationDraft,
    startDoctorConsultation,
} from "../services/doctorConsultationService.js";
import {
    getCurrentDoctorAgendaDate,
    getDoctorAvailabilitySummary,
    getDoctorAgendaViewData,
} from "../services/doctorAgendaService.js";
import { getDoctorProfile, updateDoctorProfile } from "../services/doctorProfileService.js";
import { updateDoctorProfilePhoto } from "../services/doctorProfilePhotoService.js";
import { getDoctorAppointmentDetails } from "../services/doctorAppointmentDetailsService.js";
import {
    getDoctorNotifications,
    getDoctorUnreadNotificationCount,
    markAllDoctorNotificationsRead,
    markDoctorNotificationRead,
} from "../services/doctorNotificationService.js";

const doctorRoutes = Router();

function isAdultPatient(dateOfBirth, now = new Date()) {
    if (typeof dateOfBirth !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return false;
    const todayParts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(now);
    const today = Object.fromEntries(todayParts.map(({ type, value }) => [type, value]));
    const [birthYear, birthMonth, birthDay] = dateOfBirth.split("-").map(Number);
    const todayYear = Number(today.year);
    const todayMonth = Number(today.month);
    const todayDay = Number(today.day);
    if (
        !birthYear ||
        !birthMonth ||
        !birthDay ||
        dateOfBirth > `${today.year}-${today.month}-${today.day}`
    ) {
        return false;
    }
    return (
        todayYear -
            birthYear -
            (todayMonth < birthMonth || (todayMonth === birthMonth && todayDay < birthDay)
                ? 1
                : 0) >=
        18
    );
}
const requireDoctor = [authenticateToken, requireRole("Doctor")];

doctorRoutes.get(
    "/api/doctor/notifications/unread-count",
    ...requireDoctor,
    async (req, res, next) => {
        try {
            return res.json({
                success: true,
                unreadCount: await getDoctorUnreadNotificationCount(req.auth.userId),
            });
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);

doctorRoutes.get("/api/doctor/notifications", ...requireDoctor, async (req, res, next) => {
    try {
        return res.json(await getDoctorNotifications(req.auth.userId, req.query));
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    }
});

doctorRoutes.post(
    "/api/doctor/notifications/read-all",
    ...requireDoctor,
    async (req, res, next) => {
        try {
            return res.json(await markAllDoctorNotificationsRead(req.auth.userId));
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);

doctorRoutes.post(
    "/api/doctor/notifications/:eventId/read",
    ...requireDoctor,
    async (req, res, next) => {
        try {
            return res.json(await markDoctorNotificationRead(req.auth.userId, req.params.eventId));
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);

doctorRoutes.get("/doctor/notifications", ...requireDoctor, async (req, res, next) => {
    try {
        const [header, notifications] = await Promise.all([
            getDoctorHeaderData(req.auth.userId),
            getDoctorNotifications(req.auth.userId, req.query),
        ]);
        return res.render("doctor/notifications", {
            pageTitle: "Notificaciones | SaludVital",
            activeNav: "notifications",
            bottomNavActive: "notifications",
            notifications,
            ...header,
        });
    } catch (error) {
        if (error.statusCode === 404) return res.status(404).render("errors/404");
        return next(error);
    }
});

doctorRoutes.get("/api/doctor/consultations/active", ...requireDoctor, async (req, res, next) => {
    try {
        return res.json({
            consultationId: await getActiveDoctorConsultationId(req.auth.userId),
        });
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    }
});

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
                isAdultPatient: isAdultPatient(consultation.appointment?.patient?.date_of_birth),
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

doctorRoutes.get(
    "/api/doctor/appointments/:appointmentId",
    ...requireDoctor,
    async (req, res, next) => {
        try {
            return res.json(
                await getDoctorAppointmentDetails(req.auth.userId, req.params.appointmentId),
            );
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);

doctorRoutes.get("/api/doctor/agenda", ...requireDoctor, async (req, res, next) => {
    try {
        const [agenda, nextAppointment, availability] = await Promise.all([
            getDoctorAgendaViewData(req.auth.userId, req.query.view, req.query.date),
            getDoctorNextAppointmentData(req.auth.userId),
            getDoctorAvailabilitySummary(req.auth.userId, req.query.date),
        ]);
        if (!agenda) return res.status(404).json({ message: "No se encontró el perfil médico." });
        return res.json({ ...agenda, nextAppointment, availability });
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

doctorRoutes.get("/doctor/profile", ...requireDoctor, async (req, res, next) => {
    try {
        const profile = await getDoctorProfile(req.auth.userId);
        return res.render("doctor/profile", {
            pageTitle: "Mi perfil | SaludVital",
            activeNav: "profile",
            bottomNavActive: "profile",
            doctorName: profile.fullName,
            doctorPhotoUrl: profile.photoUrl,
            profile,
        });
    } catch (error) {
        if (error.statusCode === 404) return res.status(404).render("errors/404");
        return next(error);
    }
});

doctorRoutes.put("/api/doctor/profile", ...requireDoctor, async (req, res, next) => {
    try {
        return res.json(await updateDoctorProfile(req.auth.userId, req.body));
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    }
});

doctorRoutes.post("/api/doctor/profile/photo", ...requireDoctor, async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try {
        if (
            !req.body ||
            typeof req.body !== "object" ||
            Array.isArray(req.body) ||
            Object.keys(req.body).some((field) => field !== "photo")
        ) {
            return res.status(400).json({ message: "La solicitud de foto no es válida." });
        }
        return res.json(await updateDoctorProfilePhoto(req.auth.userId, req.body?.photo));
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
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
        return res.json(
            await getDoctorPatientDetails(req.auth.userId, req.params.patientId, req.query),
        );
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
