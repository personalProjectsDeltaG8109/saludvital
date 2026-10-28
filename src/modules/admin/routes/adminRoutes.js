import { Router } from "express";
import { authenticateToken, requireRole } from "../../../middleware/authenticateToken.js";
import { getAdminDashboardData } from "../services/adminDashboardService.js";
import { getAdminAuditEvent, getAdminAuditLogs } from "../services/adminAuditService.js";
import { getAdminDoctorSchedules } from "../services/adminDoctorScheduleService.js";
import { getAdminDoctorWeeklySchedule } from "../services/adminDoctorWeeklyScheduleService.js";
import {
    createAdminDoctorScheduleException,
    getAdminDoctorScheduleExceptions,
    updateAdminDoctorScheduleException,
    updateAdminDoctorScheduleExceptionStatus,
} from "../services/adminDoctorScheduleExceptionService.js";
import { configureAdminDoctorSchedule } from "../services/adminDoctorScheduleConfigurationService.js";
import {
    deleteAdminDoctorSchedule,
    updateAdminDoctorSchedule,
} from "../services/adminDoctorScheduleEditingService.js";
import {
    createAdminAppointment,
    getAdminAppointmentBookingDoctors,
    getAdminAppointmentBookingOptions,
    getAdminAppointmentBookingTimes,
} from "../services/adminAppointmentCreationService.js";
import {
    getAdminAppointmentEditDoctors,
    getAdminAppointmentEditSpecialties,
    getAdminAppointmentForEditing,
    updateAdminAppointment,
} from "../services/adminAppointmentEditingService.js";
import {
    getAdminAppointmentDetails,
    getAdminAppointments,
    getAdminAppointmentExportFilters,
    getAdminAppointmentExportRows,
} from "../services/adminAppointmentService.js";
import { createAppointmentCsv } from "../services/adminAppointmentCsvService.js";
import { cancelAdminAppointment } from "../services/adminAppointmentStatusService.js";
import {
    getAdminDepartments,
    getAdminMunicipalities,
    getAdminUserDetails,
    getAdminUsers,
    updateAdminUser,
    updateAdminUserProfile,
} from "../services/adminUserManagementService.js";
import { getAdminWhatsAppData } from "../services/adminWhatsAppService.js";
import { getAdminProfile } from "../services/adminProfileService.js";
import { getAdminReportsData } from "../services/adminReportsService.js";
import { updateAdminProfilePersonalInformation } from "../services/adminProfileEditingService.js";
import { updateAdminProfilePreferences } from "../services/adminProfilePreferencesService.js";
import {
    removeAdminProfilePhoto,
    updateAdminProfilePhoto,
} from "../services/adminProfilePhotoService.js";
import {
    createAdminSpecialty,
    getAdminSpecialties,
    getAdminSpecialtyForEdit,
    updateAdminSpecialty,
    updateAdminSpecialtyStatus,
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

adminRoutes.get(
    "/api/admin/doctor-schedule-exceptions",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            return res.json(await getAdminDoctorScheduleExceptions(req.query));
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);
adminRoutes.post(
    "/api/admin/doctor-schedule-exceptions",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            return res
                .status(201)
                .json(await createAdminDoctorScheduleException(req.auth.userId, req.body));
        } catch (error) {
            if (error.statusCode) {
                return res.status(error.statusCode).json({
                    message: error.message,
                    ...(error.requiresConfirmation
                        ? {
                              requiresConfirmation: true,
                              affectedAppointments: error.affectedAppointments,
                          }
                        : {}),
                });
            }
            return next(error);
        }
    },
);
adminRoutes.patch(
    "/api/admin/doctor-schedule-exceptions/:exceptionId",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            return res.json(
                await updateAdminDoctorScheduleException(
                    req.auth.userId,
                    req.params.exceptionId,
                    req.body,
                ),
            );
        } catch (error) {
            if (error.statusCode) {
                return res.status(error.statusCode).json({
                    message: error.message,
                    ...(error.requiresConfirmation
                        ? {
                              requiresConfirmation: true,
                              affectedAppointments: error.affectedAppointments,
                          }
                        : {}),
                });
            }
            return next(error);
        }
    },
);
adminRoutes.patch(
    "/api/admin/doctor-schedule-exceptions/:exceptionId/status",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            return res.json(
                await updateAdminDoctorScheduleExceptionStatus(
                    req.auth.userId,
                    req.params.exceptionId,
                    req.body,
                ),
            );
        } catch (error) {
            if (error.statusCode) {
                return res.status(error.statusCode).json({
                    message: error.message,
                    ...(error.requiresConfirmation
                        ? {
                              requiresConfirmation: true,
                              affectedAppointments: error.affectedAppointments,
                              ...(error.willCancelAppointments
                                  ? { willCancelAppointments: true }
                                  : {}),
                          }
                        : {}),
                });
            }
            return next(error);
        }
    },
);

adminRoutes.get("/api/admin/specialties", ...requireAdministrator, async (req, res, next) => {
    try {
        return res.json(await getAdminSpecialties(req.query));
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    }
});
adminRoutes.get("/api/admin/audit-logs", ...requireAdministrator, async (req, res, next) => {
    try {
        return res.json(await getAdminAuditLogs(req.query));
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    }
});
adminRoutes.get(
    "/api/admin/audit-logs/:auditLogId",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            return res.json(await getAdminAuditEvent(req.params.auditLogId));
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);
adminRoutes.get("/api/admin/appointments", ...requireAdministrator, async (req, res, next) => {
    try {
        return res.json(await getAdminAppointments(req.query));
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    }
});
adminRoutes.get("/api/admin/doctor-schedules", ...requireAdministrator, async (req, res, next) => {
    try {
        return res.json(await getAdminDoctorSchedules(req.query));
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    }
});
adminRoutes.get(
    "/api/admin/doctor-schedules/:doctorId/week",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            return res.json(
                await getAdminDoctorWeeklySchedule(req.params.doctorId, req.query.weekStart),
            );
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);
adminRoutes.post("/api/admin/doctor-schedules", ...requireAdministrator, async (req, res, next) => {
    try {
        const result = await configureAdminDoctorSchedule(req.body, req.auth.userId);
        return res.status(201).json({
            ...result,
            message: "El horario se configuró correctamente.",
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                message: error.message,
                ...(error.requiresConfirmation
                    ? {
                          requiresConfirmation: true,
                          impactedAppointments: error.impactedAppointments,
                      }
                    : {}),
            });
        }
        return next(error);
    }
});
adminRoutes.patch(
    "/api/admin/doctor-schedules/:scheduleId",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            return res.json(
                await updateAdminDoctorSchedule(req.auth.userId, req.params.scheduleId, req.body),
            );
        } catch (error) {
            if (error.statusCode) {
                return res.status(error.statusCode).json({
                    message: error.message,
                    ...(error.requiresConfirmation
                        ? {
                              requiresConfirmation: true,
                              impactedAppointments: error.impactedAppointments,
                          }
                        : {}),
                });
            }
            return next(error);
        }
    },
);
adminRoutes.delete(
    "/api/admin/doctor-schedules/:scheduleId",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            return res.json(
                await deleteAdminDoctorSchedule(req.auth.userId, req.params.scheduleId, req.body),
            );
        } catch (error) {
            if (error.statusCode) {
                return res.status(error.statusCode).json({
                    message: error.message,
                    ...(error.requiresConfirmation
                        ? {
                              requiresConfirmation: true,
                              impactedAppointments: error.impactedAppointments,
                          }
                        : {}),
                });
            }
            return next(error);
        }
    },
);
adminRoutes.get(
    "/api/admin/appointments/export",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            res.set("Cache-Control", "no-store");
            const appointments = await getAdminAppointmentExportRows(req.query);
            if (appointments.length === 0) return res.status(204).end();

            res.set("Content-Type", "text/csv; charset=utf-8");
            res.set("Content-Disposition", 'attachment; filename="saludvital-citas.csv"');
            return res.send(createAppointmentCsv(appointments));
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);
adminRoutes.patch(
    "/api/admin/appointments/:appointmentId/status",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            const result = await cancelAdminAppointment(
                req.auth.userId,
                req.params.appointmentId,
                req.body,
            );
            return res.json({ ...result, message: "La cita se canceló correctamente." });
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);
adminRoutes.get(
    "/api/admin/appointment-booking/options",
    ...requireAdministrator,
    async (_req, res, next) => {
        try {
            return res.json(await getAdminAppointmentBookingOptions());
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);
adminRoutes.get(
    "/api/admin/appointment-booking/doctors",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            return res.json({
                doctors: await getAdminAppointmentBookingDoctors(req.query.specialtyId),
            });
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);
adminRoutes.get(
    "/api/admin/appointment-booking/availability",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            const times = await getAdminAppointmentBookingTimes(req.query);
            return res.json({ times });
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);
adminRoutes.post("/api/admin/appointments", ...requireAdministrator, async (req, res, next) => {
    try {
        const appointment = await createAdminAppointment(req.auth.userId, req.body);
        return res.status(201).json({
            appointmentId: appointment.id,
            message: "La cita se creó y confirmó correctamente.",
        });
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    }
});
adminRoutes.get(
    "/api/admin/appointment-edit/specialties",
    ...requireAdministrator,
    async (_req, res, next) => {
        try {
            return res.json({ specialties: await getAdminAppointmentEditSpecialties() });
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);
adminRoutes.get(
    "/api/admin/appointment-edit/doctors",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            return res.json({
                doctors: await getAdminAppointmentEditDoctors(req.query.specialtyId),
            });
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);
adminRoutes.patch(
    "/api/admin/appointments/:appointmentId/reschedule",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            const appointment = await updateAdminAppointment(
                req.auth.userId,
                req.params.appointmentId,
                req.body,
            );
            return res.json({
                appointmentId: appointment.id,
                message: "La cita se actualizó y reprogramó correctamente.",
            });
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);
adminRoutes.get(
    "/api/admin/appointments/:appointmentId",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            return res.json({
                appointment: await getAdminAppointmentDetails(req.params.appointmentId),
            });
        } catch (error) {
            if (error.statusCode)
                return res.status(error.statusCode).json({ message: error.message });
            return next(error);
        }
    },
);
adminRoutes.post("/api/admin/specialties", ...requireAdministrator, async (req, res, next) => {
    try {
        const specialty = await createAdminSpecialty(req.auth.userId, req.body);
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
adminRoutes.patch(
    "/api/admin/specialties/:specialtyId/status",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            const specialty = await updateAdminSpecialtyStatus(
                req.auth.userId,
                req.params.specialtyId,
                req.body?.isActive,
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
adminRoutes.get("/admin/doctor-schedules", ...requireAdministrator, (_req, res) => {
    return res.render("admin/doctor-schedules", {
        pageTitle: "Horarios y disponibilidad | SaludVital",
        adminName: "Administrador",
    });
});
adminRoutes.get("/admin/audit", ...requireAdministrator, (_req, res) => {
    return res.render("admin/audit", {
        pageTitle: "Auditoría | SaludVital",
        adminName: "Administrador",
    });
});
adminRoutes.get("/admin/appointments", ...requireAdministrator, (_req, res) => {
    return res.render("admin/appointments", {
        pageTitle: "Citas médicas | SaludVital",
        adminName: "Administrador",
    });
});
adminRoutes.get(
    "/admin/appointments/export/pdf",
    ...requireAdministrator,
    async (req, res, next) => {
        const generatedAt = new Intl.DateTimeFormat("es-CO", {
            dateStyle: "full",
            timeStyle: "short",
            timeZone: "America/Bogota",
        }).format(new Date());

        try {
            const [rows, filters] = await Promise.all([
                getAdminAppointmentExportRows(req.query),
                getAdminAppointmentExportFilters(req.query),
            ]);
            const dateTimeFormat = new Intl.DateTimeFormat("es-CO", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "America/Bogota",
            });
            const appointments = rows.map((appointment) => ({
                ...appointment,
                startAtLabel: dateTimeFormat.format(new Date(appointment.startAt)),
                endAtLabel: dateTimeFormat.format(new Date(appointment.endAt)),
            }));

            return res.render("admin/appointment-export-report", {
                pageTitle: "Reporte de citas médicas | SaludVital",
                generatedAt,
                filters,
                appointments,
                errorMessage: null,
            });
        } catch (error) {
            if (!error.statusCode) return next(error);
            return res.status(error.statusCode).render("admin/appointment-export-report", {
                pageTitle: "No fue posible generar el reporte | SaludVital",
                generatedAt,
                filters: [],
                appointments: [],
                errorMessage: error.message,
            });
        }
    },
);
adminRoutes.get("/admin/appointments/new", ...requireAdministrator, (_req, res) => {
    return res.render("admin/appointment-create", {
        pageTitle: "Nueva cita | SaludVital",
        adminName: "Administrador",
    });
});
adminRoutes.get(
    "/admin/appointments/:appointmentId/edit",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            const appointment = await getAdminAppointmentForEditing(req.params.appointmentId);
            return res.render("admin/appointment-edit", {
                pageTitle: `Editar cita #${appointment.id} | SaludVital`,
                adminName: "Administrador",
                appointment,
            });
        } catch (error) {
            if (error.statusCode === 404) {
                return res.status(404).render("errors/404", {
                    pageTitle: "Cita no encontrada | SaludVital",
                    homeHref: "/admin/dashboard",
                    appointmentsHref: "/admin/appointments",
                    supportHref:
                        "https://wa.me/573137498332?text=Hola%2C%20quisiera%20recibir%20informaci%C3%B3n%20sobre%20SaludVital.",
                });
            }
            return next(error);
        }
    },
);
adminRoutes.get(
    "/admin/appointments/:appointmentId",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            const appointment = await getAdminAppointmentDetails(req.params.appointmentId);
            return res.render("admin/appointment-details", {
                pageTitle: `Cita #${appointment.id} | SaludVital`,
                adminName: "Administrador",
                appointment,
            });
        } catch (error) {
            if (error.statusCode === 404) {
                return res.status(404).render("errors/404", {
                    pageTitle: "Cita no encontrada | SaludVital",
                    homeHref: "/admin/dashboard",
                    appointmentsHref: "/admin/appointments",
                    supportHref:
                        "https://wa.me/573137498332?text=Hola%2C%20quisiera%20recibir%20informaci%C3%B3n%20sobre%20SaludVital.",
                });
            }
            return next(error);
        }
    },
);
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
        return res.json(await getAdminDashboardData(req.query, req.auth.userId));
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
        const dashboard = await getAdminDashboardData(req.query, req.auth.userId);
        return res.render("admin/dashboard", {
            pageTitle: "Panel administrativo | SaludVital",
            adminName: "Administrador",
            dashboard,
        });
    } catch (error) {
        return next(error);
    }
});

// Render the administrator reports page using persisted, period-bounded aggregates.
adminRoutes.get("/api/admin/reports", ...requireAdministrator, async (_req, res, next) => {
    try {
        const reports = await getAdminReportsData();
        return res.render("admin/partials/admin-reports-content", { reports }, (error, html) => {
            if (error) return next(error);
            res.set("Cache-Control", "no-store");
            return res.type("html").send(html);
        });
    } catch {
        return res.status(503).json({ message: "No pudimos cargar los reportes." });
    }
});

adminRoutes.get("/admin/reports", ...requireAdministrator, (_req, res) => {
    return res.render("admin/reports", {
        pageTitle: "Reportes e indicadores | SaludVital",
        adminName: "Administrador",
    });
});

adminRoutes.get("/admin/profile", ...requireAdministrator, async (req, res, next) => {
    try {
        const profile = await getAdminProfile(req.auth.userId);
        return res.render("admin/profile", {
            pageTitle: "Mi perfil | SaludVital",
            adminName: profile.displayName || "Administrador",
            profile,
        });
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).send(error.message);
        return next(error);
    }
});

adminRoutes.patch("/api/admin/profile", ...requireAdministrator, async (req, res, next) => {
    try {
        return res.json(await updateAdminProfilePersonalInformation(req.auth.userId, req.body));
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    }
});

adminRoutes.patch(
    "/api/admin/profile/preferences",
    ...requireAdministrator,
    async (req, res, next) => {
        try {
            return res.json(await updateAdminProfilePreferences(req.auth.userId, req.body));
        } catch (error) {
            if (error.statusCode) {
                return res.status(error.statusCode).json({ message: error.message });
            }
            return next(error);
        }
    },
);

adminRoutes.post("/api/admin/profile/photo", ...requireAdministrator, async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try {
        return res.json(await updateAdminProfilePhoto(req.auth.userId, req.body?.photo));
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    }
});

adminRoutes.delete("/api/admin/profile/photo", ...requireAdministrator, async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try {
        return res.json(await removeAdminProfilePhoto(req.auth.userId));
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
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
