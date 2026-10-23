import { Op } from "sequelize";
import {
    Appointment,
    AppointmentStatus,
    Consultation,
    Doctor,
    Patient,
    Specialities,
} from "../../../models/associations.js";

const BOGOTA_TIME_ZONE = "America/Bogota";
const CANCELLED_STATUS = "Cancelled";

function getBogotaDateParts(date) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: BOGOTA_TIME_ZONE,
        year: "numeric",
        month: "numeric",
        day: "numeric",
    }).formatToParts(date);

    return Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
}

function getBogotaDayStart(date) {
    const { year, month, day } = getBogotaDateParts(date);

    // Bogotá stays at UTC-5, so local midnight is 05:00 UTC.
    return new Date(Date.UTC(year, month - 1, day, 5));
}

function getCurrentBogotaWeek(date) {
    const dayStart = getBogotaDayStart(date);
    const { year, month, day } = getBogotaDateParts(date);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const daysSinceMonday = (weekday + 6) % 7;
    const start = new Date(dayStart.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);

    return { start, end: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000) };
}

function formatBogotaTime(date) {
    return new Intl.DateTimeFormat("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: BOGOTA_TIME_ZONE,
    }).format(date);
}

function getBogotaTimeParts(date) {
    const parts = new Intl.DateTimeFormat("es-CO", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: BOGOTA_TIME_ZONE,
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

    return {
        time: `${values.hour}:${values.minute}`,
        meridiem: values.dayPeriod?.toLowerCase().includes("a") ? "AM" : "PM",
    };
}

function formatBogotaDate(date) {
    return new Intl.DateTimeFormat("es-CO", {
        day: "numeric",
        month: "long",
        timeZone: BOGOTA_TIME_ZONE,
    }).format(date);
}

function getBogotaCalendarDate(date) {
    const parts = new Intl.DateTimeFormat("es-CO", {
        day: "2-digit",
        month: "short",
        timeZone: BOGOTA_TIME_ZONE,
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

    return {
        day: values.day,
        month: values.month.replace(".", "").toUpperCase(),
    };
}

function getPatientName(patient) {
    return [patient?.first_name, patient?.last_name].filter(Boolean).join(" ") || "Paciente";
}

function getAppointmentStatusLabel(status) {
    return (
        {
            Confirmed: "Confirmada",
            "In Progress": "En curso",
            Attended: "Atendida",
            Cancelled: "Cancelada",
        }[status] ||
        status ||
        "Programada"
    );
}

function serializeAppointment(appointment, { includePatientPhoto = false } = {}) {
    return {
        id: appointment.id,
        patientName: getPatientName(appointment.patient),
        ...(includePatientPhoto
            ? { patientPhotoUrl: appointment.patient?.profile_photo_url || null }
            : {}),
        reason: appointment.reason,
        status: appointment.status?.name || "Programada",
        statusLabel: getAppointmentStatusLabel(appointment.status?.name),
        statusKey: (appointment.status?.name || "scheduled").toLowerCase().replaceAll(" ", "-"),
        startAt: appointment.start_at,
        endAt: appointment.end_at,
        timeLabel: formatBogotaTime(appointment.start_at),
        ...getBogotaTimeParts(appointment.start_at),
        dateLabel: formatBogotaDate(appointment.start_at),
        ...getBogotaCalendarDate(appointment.start_at),
    };
}

async function getDoctorForUser(userId) {
    return Doctor.findOne({
        where: { user_id: userId },
        attributes: ["id", "display_name", "profile_photo_url"],
    });
}

async function getCompletedConsultations(doctorId, start, end) {
    return Consultation.findAll({
        where: {
            doctor_id: doctorId,
            status: "Completed",
            ended_at: { [Op.gte]: start, [Op.lt]: end },
        },
        attributes: ["duration_seconds"],
        raw: true,
    });
}

async function getActivePatientRows(doctorId, since) {
    return Appointment.findAll({
        where: { doctor_id: doctorId },
        attributes: ["patient_id"],
        include: [
            {
                model: Consultation,
                as: "consultation",
                required: true,
                attributes: [],
                where: {
                    doctor_id: doctorId,
                    status: "Completed",
                    ended_at: { [Op.gte]: since },
                },
            },
            {
                model: Patient,
                as: "patient",
                required: true,
                attributes: ["id", "first_name", "last_name"],
            },
        ],
        order: [[{ model: Patient, as: "patient" }, "last_name", "ASC"]],
    });
}

export async function getDoctorDashboardData(userId, now = new Date()) {
    const doctor = await getDoctorForUser(userId);

    if (!doctor) {
        return null;
    }

    const dayStart = getBogotaDayStart(now);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const week = getCurrentBogotaWeek(now);
    const activeSince = new Date(now);
    activeSince.setUTCFullYear(activeSince.getUTCFullYear() - 1);

    const [todayAppointments, nextAppointment, activePatientRows, weeklyConsultations] =
        await Promise.all([
            Appointment.findAll({
                where: {
                    doctor_id: doctor.id,
                    start_at: { [Op.gte]: dayStart, [Op.lt]: dayEnd },
                },
                include: [
                    {
                        model: Patient,
                        as: "patient",
                        attributes: ["id", "first_name", "last_name", "profile_photo_url"],
                    },
                    {
                        model: AppointmentStatus,
                        as: "status",
                        attributes: ["name"],
                        required: true,
                    },
                ],
                order: [["start_at", "ASC"]],
            }),
            Appointment.findOne({
                where: {
                    doctor_id: doctor.id,
                    start_at: { [Op.gte]: now },
                },
                include: [
                    {
                        model: Patient,
                        as: "patient",
                        attributes: ["id", "first_name", "last_name", "profile_photo_url"],
                    },
                    {
                        model: AppointmentStatus,
                        as: "status",
                        attributes: ["name"],
                        required: true,
                        where: { name: { [Op.ne]: CANCELLED_STATUS } },
                    },
                ],
                order: [["start_at", "ASC"]],
            }),
            getActivePatientRows(doctor.id, activeSince),
            getCompletedConsultations(doctor.id, week.start, week.end),
        ]);

    const distinctPatients = new Map();
    for (const appointment of activePatientRows) {
        distinctPatients.set(appointment.patient.id, appointment.patient);
    }

    const durations = weeklyConsultations
        .filter(
            ({ duration_seconds }) => duration_seconds !== null && duration_seconds !== undefined,
        )
        .map(({ duration_seconds }) => Number(duration_seconds))
        .filter((duration) => Number.isFinite(duration) && duration >= 0);
    const averageDurationSeconds = durations.length
        ? Math.round(durations.reduce((total, duration) => total + duration, 0) / durations.length)
        : null;

    // Keep cancelled appointments visible in today's list while excluding them from the count.
    const visibleAppointments = todayAppointments;
    const countableTodayAppointments = visibleAppointments.filter(
        (appointment) => appointment.status?.name !== CANCELLED_STATUS,
    );

    return {
        doctorName: doctor.display_name || "Médico",
        doctorPhotoUrl: doctor.profile_photo_url,
        metrics: {
            appointmentsToday: countableTodayAppointments.length,
            activePatients: distinctPatients.size,
            consultationsThisWeek: weeklyConsultations.length,
            averageDurationSeconds,
        },
        todayAppointments: visibleAppointments.map((appointment) =>
            serializeAppointment(appointment, { includePatientPhoto: true }),
        ),
        nextAppointment: nextAppointment
            ? serializeAppointment(nextAppointment, { includePatientPhoto: true })
            : null,
    };
}

export async function getDoctorActivePatients(userId) {
    const doctor = await getDoctorForUser(userId);
    if (!doctor) return null;

    const activeSince = new Date();
    activeSince.setUTCFullYear(activeSince.getUTCFullYear() - 1);
    const rows = await getActivePatientRows(doctor.id, activeSince);
    const uniquePatients = new Map();

    for (const appointment of rows) {
        uniquePatients.set(appointment.patient.id, {
            id: appointment.patient.id,
            name: getPatientName(appointment.patient),
        });
    }

    return {
        doctorName: doctor.display_name || "Médico",
        doctorPhotoUrl: doctor.profile_photo_url,
        patients: [...uniquePatients.values()].sort((a, b) => a.name.localeCompare(b.name, "es")),
    };
}

function parseAppointmentFilters(query) {
    const readQueryValue = (key) => {
        const value = query[key];
        if (value === undefined) return "";
        if (typeof value !== "string") {
            const error = new Error("Uno de los filtros enviados no es válido.");
            error.statusCode = 400;
            throw error;
        }
        return value.trim();
    };
    const rawPage = readQueryValue("page");
    const requestedPage = rawPage && /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
    const filters = {
        search: readQueryValue("search").slice(0, 100),
        startDate: readQueryValue("startDate"),
        endDate: readQueryValue("endDate"),
        specialtyId: readQueryValue("specialty"),
        status: readQueryValue("status"),
        page: requestedPage,
    };
    const validDate = (value) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const parsedDate = new Date(`${value}T00:00:00.000Z`);
        return (
            !Number.isNaN(parsedDate.getTime()) &&
            parsedDate.toISOString().slice(0, 10) === value
        );
    };

    if (
        (filters.startDate && !validDate(filters.startDate)) ||
        (filters.endDate && !validDate(filters.endDate))
    ) {
        const error = new Error("Selecciona un rango de fechas válido.");
        error.statusCode = 400;
        throw error;
    }

    if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
        const error = new Error("La fecha inicial no puede ser posterior a la fecha final.");
        error.statusCode = 400;
        throw error;
    }

    if (filters.specialtyId && !/^\d+$/.test(filters.specialtyId)) {
        const error = new Error("La especialidad seleccionada no es válida.");
        error.statusCode = 400;
        throw error;
    }

    if (!Number.isSafeInteger(filters.page) || filters.page < 1) filters.page = 1;
    return filters;
}

function getBogotaDateBoundary(date, endOfDay = false) {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + (endOfDay ? 1 : 0), 5));
}

export async function getDoctorAppointments(userId, query = {}) {
    const doctor = await getDoctorForUser(userId);
    if (!doctor) return null;

    const filters = parseAppointmentFilters(query);
    const where = { doctor_id: doctor.id };
    const patientWhere = {};
    const appointmentDate = {};
    const limit = 6;

    if (filters.startDate) {
        appointmentDate[Op.gte] = getBogotaDateBoundary(filters.startDate);
    }
    if (filters.endDate) {
        appointmentDate[Op.lt] = getBogotaDateBoundary(filters.endDate, true);
    }
    if (Object.keys(appointmentDate).length) where.start_at = appointmentDate;
    if (filters.specialtyId) {
        where.specialty_id = Number(filters.specialtyId);
        const assignedSpecialty = await Appointment.findOne({
            where: { doctor_id: doctor.id, specialty_id: where.specialty_id },
            attributes: ["id"],
        });
        if (!assignedSpecialty) {
            const error = new Error("La especialidad seleccionada no es válida.");
            error.statusCode = 400;
            throw error;
        }
    }
    if (filters.status) {
        if (filters.status === "In Progress") {
            const error = new Error("El estado en curso no está disponible como filtro.");
            error.statusCode = 400;
            throw error;
        }
        const statusExists = await AppointmentStatus.findOne({
            where: { name: filters.status },
            attributes: ["id"],
        });
        if (!statusExists) {
            const error = new Error("El estado seleccionado no es válido.");
            error.statusCode = 400;
            throw error;
        }
        where.status_id = statusExists.id;
    }

    if (filters.search) {
        const searchTerm = `%${filters.search}%`;
        const searchWords = filters.search.split(/\s+/).filter(Boolean);
        patientWhere[Op.or] = [
            { document_number: { [Op.like]: searchTerm } },
            {
                [Op.and]: searchWords.map((word) => ({
                    [Op.or]: [
                        { first_name: { [Op.like]: `%${word}%` } },
                        { last_name: { [Op.like]: `%${word}%` } },
                    ],
                })),
            },
        ];
    }

    const [result, statusRows, specialtyRows, statusCounts] = await Promise.all([
        Appointment.findAndCountAll({
            where,
            include: [
                {
                    model: Patient,
                    as: "patient",
                    attributes: [
                        "id",
                        "first_name",
                        "last_name",
                        "profile_photo_url",
                        "document_number",
                    ],
                    required: Boolean(filters.search),
                    ...(filters.search ? { where: patientWhere } : {}),
                },
                { model: AppointmentStatus, as: "status", attributes: ["name"], required: true },
                { model: Specialities, as: "specialty", attributes: ["name"], required: true },
            ],
            order: [["start_at", "ASC"]],
            limit,
            offset: (filters.page - 1) * limit,
        }),
        AppointmentStatus.findAll({ attributes: ["name"], order: [["name", "ASC"]] }),
        Appointment.findAll({
            where: { doctor_id: doctor.id },
            attributes: ["specialty_id"],
            group: ["specialty_id"],
            raw: true,
        }).then((rows) =>
            Specialities.findAll({
                where: { id: rows.map((row) => row.specialty_id) },
                attributes: ["id", "name"],
                order: [["name", "ASC"]],
            }),
        ),
        Appointment.findAll({
            where: { doctor_id: doctor.id },
            attributes: [
                "status_id",
                [Appointment.sequelize.fn("COUNT", Appointment.sequelize.col("id")), "count"],
            ],
            group: ["status_id"],
            raw: true,
        }),
    ]);

    const countByStatusId = new Map(
        statusCounts.map((row) => [Number(row.status_id), Number(row.count)]),
    );
    const counts = Object.fromEntries(
        statusRows.map((status) => [status.name, countByStatusId.get(status.id) || 0]),
    );
    const totalPages = Math.max(1, Math.ceil(result.count / limit));
    const page = Math.min(filters.page, totalPages);

    // If a stale page number was requested, fetch the last valid page instead of showing an empty result.
    const appointments =
        page === filters.page
            ? result.rows
            : await Appointment.findAll({
                  where,
                  include: [
                      {
                          model: Patient,
                          as: "patient",
                          attributes: [
                              "id",
                              "first_name",
                              "last_name",
                              "profile_photo_url",
                              "document_number",
                          ],
                          required: Boolean(filters.search),
                          ...(filters.search ? { where: patientWhere } : {}),
                      },
                      {
                          model: AppointmentStatus,
                          as: "status",
                          attributes: ["name"],
                          required: true,
                      },
                      {
                          model: Specialities,
                          as: "specialty",
                          attributes: ["name"],
                          required: true,
                      },
                  ],
                  order: [["start_at", "ASC"]],
                  limit,
                  offset: (page - 1) * limit,
              });

    return {
        doctorName: doctor.display_name || "Médico",
        doctorPhotoUrl: doctor.profile_photo_url,
        appointments: appointments.map((appointment) => ({
            ...serializeAppointment(appointment, { includePatientPhoto: true }),
            specialty: appointment.specialty?.name || "Consulta médica",
        })),
        appointmentFilters: { ...filters, page },
        appointmentStatuses: statusRows
            .filter((status) => status.name !== "In Progress")
            .sort((first, second) => {
                const statusOrder = { Confirmed: 0, Attended: 1, Cancelled: 2 };
                return (statusOrder[first.name] ?? 3) - (statusOrder[second.name] ?? 3);
            })
            .map((status) => ({
                name: status.name,
                label: getAppointmentStatusLabel(status.name),
                summaryLabel:
                    {
                        Confirmed: "Confirmadas",
                        Attended: "Atendidas",
                        Cancelled: "Canceladas",
                    }[status.name] || getAppointmentStatusLabel(status.name),
                count: counts[status.name] || 0,
            })),
        appointmentTotalCount: statusCounts.reduce((total, row) => total + Number(row.count), 0),
        appointmentSpecialties: specialtyRows.map((specialty) => ({
            id: specialty.id,
            name: specialty.name,
        })),
        appointmentCount: result.count,
        appointmentPage: page,
        appointmentPageSize: limit,
        appointmentTotalPages: totalPages,
    };
}
