import { Op } from "sequelize";
import {
    Appointment,
    AppointmentStatus,
    Consultation,
    Doctor,
    Patient,
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

function formatBogotaDate(date) {
    return new Intl.DateTimeFormat("es-CO", {
        day: "2-digit",
        month: "short",
        timeZone: BOGOTA_TIME_ZONE,
    }).format(date);
}

function getPatientName(patient) {
    return [patient?.first_name, patient?.last_name].filter(Boolean).join(" ") || "Paciente";
}

function serializeAppointment(appointment) {
    return {
        id: appointment.id,
        patientName: getPatientName(appointment.patient),
        reason: appointment.reason,
        status: appointment.status?.name || "Programada",
        startAt: appointment.start_at,
        endAt: appointment.end_at,
        timeLabel: formatBogotaTime(appointment.start_at),
        dateLabel: formatBogotaDate(appointment.start_at),
    };
}

async function getDoctorForUser(userId) {
    return Doctor.findOne({
        where: { user_id: userId },
        attributes: ["id", "display_name", "professional_information"],
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
                    { model: Patient, as: "patient", attributes: ["id", "first_name", "last_name"] },
                    { model: AppointmentStatus, as: "status", attributes: ["name"], required: true, where: { name: { [Op.ne]: CANCELLED_STATUS } } },
                ],
                order: [["start_at", "ASC"]],
            }),
            Appointment.findOne({
                where: {
                    doctor_id: doctor.id,
                    start_at: { [Op.gte]: now },
                },
                include: [
                    { model: Patient, as: "patient", attributes: ["id", "first_name", "last_name"] },
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
        .filter(({ duration_seconds }) => duration_seconds !== null && duration_seconds !== undefined)
        .map(({ duration_seconds }) => Number(duration_seconds))
        .filter((duration) => Number.isFinite(duration) && duration >= 0);
    const averageDurationSeconds = durations.length
        ? Math.round(durations.reduce((total, duration) => total + duration, 0) / durations.length)
        : null;

    // Keep the dashboard response limited to summary fields; cancelled records were excluded in SQL.
    const visibleAppointments = todayAppointments;

    return {
        doctorName: doctor.display_name || "Médico",
        metrics: {
            appointmentsToday: visibleAppointments.length,
            activePatients: distinctPatients.size,
            consultationsThisWeek: weeklyConsultations.length,
            averageDurationSeconds,
        },
        todayAppointments: visibleAppointments.map(serializeAppointment),
        nextAppointment: nextAppointment ? serializeAppointment(nextAppointment) : null,
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

    return [...uniquePatients.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export async function getDoctorAppointments(userId) {
    const doctor = await getDoctorForUser(userId);
    if (!doctor) return null;

    const appointments = await Appointment.findAll({
        where: { doctor_id: doctor.id },
        include: [
            { model: Patient, as: "patient", attributes: ["id", "first_name", "last_name"] },
            { model: AppointmentStatus, as: "status", attributes: ["name"] },
        ],
        order: [["start_at", "DESC"]],
        limit: 100,
    });

    return appointments.map(serializeAppointment);
}
