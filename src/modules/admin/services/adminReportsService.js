import { col, fn, Op } from "sequelize";
import {
    Appointment,
    AppointmentHistory,
    AppointmentStatus,
    Consultation,
    Doctor,
    Specialities,
} from "../../../models/associations.js";
import WhatsAppAppointmentRequest from "../../../models/WhatsAppAppointmentRequest.js";

const BOGOTA_TIME_ZONE = "America/Bogota";
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REPORT_DAYS = 30;
const SUPPORTED_REPORT_DAYS = [7, 30, 90];
const APPOINTMENT_STATUSES = ["Confirmed", "In Progress", "Attended", "Cancelled"];
const STATUS_CHART_STATUSES = ["Confirmed", "Cancelled", "Rescheduled"];
const STATUS_PRESENTATION = {
    Confirmed: { label: "Confirmadas", color: "#13b87a" },
    Cancelled: { label: "Canceladas", color: "#ff4c55" },
    Rescheduled: { label: "Reprogramadas", color: "#168de2" },
};
const SPECIALTY_COLORS = ["#168de2", "#13b8b0", "#7c8ef5", "#f59e0b", "#13b87a", "#ff747b"];

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
    return new Date(Date.UTC(year, month - 1, day, 5));
}

function getReportRange(referenceDate, reportDays) {
    const end = getBogotaDayStart(referenceDate);
    const start = new Date(end.getTime() - (reportDays - 1) * DAY_IN_MS);
    return { start, end: new Date(end.getTime() + DAY_IN_MS) };
}

export function parseReportPeriod(value) {
    if (value === undefined) return DEFAULT_REPORT_DAYS;
    if (typeof value !== "string" || !["7", "30", "90"].includes(value)) {
        throw new Error("El período seleccionado no es válido.");
    }
    return Number(value);
}

function dateKey(date) {
    const { year, month, day } = getBogotaDateParts(date);
    return [year, String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
}

function dateFromKey(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12));
}

function formatDate(value, options = { dateStyle: "medium" }) {
    return new Intl.DateTimeFormat("es-CO", {
        ...options,
        timeZone: BOGOTA_TIME_ZONE,
    }).format(dateFromKey(value));
}

function toCount(value) {
    return Number(value) || 0;
}

function createDateKeys(start, count) {
    return Array.from({ length: count }, (_, index) => {
        const date = new Date(start.getTime() + index * DAY_IN_MS);
        return dateKey(date);
    });
}

function buildTrendSeries(rows, dates) {
    const valuesByStatus = Object.fromEntries(
        ["Attended", "Confirmed", "Cancelled"].map((status) => [status, new Map()]),
    );

    for (const row of rows) {
        const date = row.date instanceof Date ? dateKey(row.date) : String(row.date).slice(0, 10);
        valuesByStatus[row.status]?.set(date, toCount(row.count));
    }

    const maximum = Math.max(
        1,
        ...Object.values(valuesByStatus).flatMap((values) =>
            dates.map((date) => values.get(date) || 0),
        ),
    );
    const chartWidth = 680;
    const chartHeight = 210;
    const horizontalPadding = 12;
    const verticalPadding = 12;
    const series = [
        { status: "Attended", label: "Atendidas", color: "#13b87a" },
        { status: "Confirmed", label: "Confirmadas", color: "#168de2" },
        { status: "Cancelled", label: "Canceladas", color: "#ff4c55" },
    ];
    const total = Object.values(valuesByStatus)
        .flatMap((counts) => [...counts.values()])
        .reduce((sum, count) => sum + count, 0);

    return {
        total,
        maximum,
        dates: dates.map((date, index) => ({
            key: date,
            label: formatDate(date, { day: "numeric", month: "short" }).replace(".", ""),
            showLabel: index === 0 || index === dates.length - 1 || index % 7 === 0,
            x:
                horizontalPadding +
                (index * (chartWidth - horizontalPadding * 2)) / (dates.length - 1),
        })),
        series: series.map((item) => {
            const values = dates.map((date) => valuesByStatus[item.status].get(date) || 0);
            const points = values
                .map((value, index) => {
                    const x =
                        horizontalPadding +
                        (index * (chartWidth - horizontalPadding * 2)) / (values.length - 1);
                    const y =
                        chartHeight -
                        verticalPadding -
                        (value / maximum) * (chartHeight - verticalPadding * 2);
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                })
                .join(" ");
            return { ...item, values, points };
        }),
    };
}

function buildStatusDistribution(rows, reprogrammedAppointmentCount) {
    const countByStatus = new Map(rows.map((row) => [row.status, toCount(row.count)]));
    const confirmedCount = countByStatus.get("Confirmed") || 0;
    const rescheduledCount = Math.min(toCount(reprogrammedAppointmentCount), confirmedCount);
    const countByChartStatus = new Map([
        ["Confirmed", confirmedCount - rescheduledCount],
        ["Cancelled", countByStatus.get("Cancelled") || 0],
        ["Rescheduled", rescheduledCount],
    ]);
    const total = STATUS_CHART_STATUSES.reduce(
        (sum, status) => sum + countByChartStatus.get(status),
        0,
    );
    let start = 0;
    const segments = STATUS_CHART_STATUSES.map((status) => {
        const count = countByChartStatus.get(status);
        const percentage = total ? (count / total) * 100 : 0;
        const segment = {
            status,
            label: STATUS_PRESENTATION[status].label,
            color: STATUS_PRESENTATION[status].color,
            count,
            percentage,
            start,
            end: start + percentage * 3.6,
        };
        start = segment.end;
        return segment;
    });
    const gradient = total
        ? segments
              .map(
                  (segment) =>
                      `${segment.color} ${segment.start.toFixed(2)}deg ${segment.end.toFixed(2)}deg`,
              )
              .join(", ")
        : "#e8eef7 0deg 360deg";

    return {
        total,
        segments,
        style: `background: conic-gradient(${gradient})`,
        description: total
            ? `Distribución de ${total} citas por estado: ${segments
                  .filter((segment) => segment.count)
                  .map((segment) => `${segment.label}: ${segment.count}`)
                  .join(", ")}.`
            : "No hay citas confirmadas, canceladas o reprogramadas en el período.",
    };
}

function buildSpecialtyDistribution(rows) {
    const specialties = rows
        .map((row) => ({
            name: row.specialty || "Sin especialidad asignada",
            count: toCount(row.count),
        }))
        .sort(
            (first, second) =>
                second.count - first.count || first.name.localeCompare(second.name, "es"),
        );
    const visible = specialties.slice(0, 6);
    const remainingCount = specialties.slice(6).reduce((total, item) => total + item.count, 0);
    if (remainingCount) visible.push({ name: "Otras especialidades", count: remainingCount });
    const maximum = Math.max(1, ...visible.map((item) => item.count));

    return visible.map((item, index) => ({
        ...item,
        color: SPECIALTY_COLORS[index % SPECIALTY_COLORS.length],
        height: Math.max(4, Math.round((item.count / maximum) * 150)),
    }));
}

function buildDoctorRanking(rows) {
    const doctors = rows.map((row) => ({
        name: row.doctorName || "Médico sin nombre registrado",
        count: toCount(row.count),
    }));
    const maximum = Math.max(1, ...doctors.map((doctor) => doctor.count));
    return doctors.map((doctor, index) => ({
        ...doctor,
        rank: index + 1,
        width: Math.round((doctor.count / maximum) * 100),
    }));
}

/** Load every report aggregate using one validated reporting period. */
export async function getAdminReportsData(
    referenceDate = new Date(),
    reportDays = DEFAULT_REPORT_DAYS,
) {
    if (!SUPPORTED_REPORT_DAYS.includes(reportDays)) {
        throw new Error("El período seleccionado no es válido.");
    }

    const range = getReportRange(referenceDate, reportDays);
    const appointmentWhere = {
        start_at: { [Op.gte]: range.start, [Op.lt]: range.end },
    };
    const consultationWhere = {
        started_at: { [Op.gte]: range.start, [Op.lt]: range.end },
        status: "Completed",
        duration_seconds: { [Op.not]: null },
    };

    const [
        statusRows,
        distinctPatientCount,
        reprogrammedAppointmentCount,
        specialtyRows,
        doctorRows,
        trendRows,
        durationRow,
        whatsappRequestCount,
    ] = await Promise.all([
        Appointment.findAll({
            attributes: [
                [col("status.name"), "status"],
                [fn("COUNT", col("Appointment.id")), "count"],
            ],
            include: [{ model: AppointmentStatus, as: "status", attributes: [], required: true }],
            where: { ...appointmentWhere, "$status.name$": { [Op.in]: APPOINTMENT_STATUSES } },
            group: ["status.name"],
            raw: true,
        }),
        Appointment.count({
            where: appointmentWhere,
            include: [
                {
                    model: AppointmentStatus,
                    as: "status",
                    attributes: [],
                    required: true,
                    where: { name: { [Op.in]: APPOINTMENT_STATUSES } },
                },
            ],
            distinct: true,
            col: "patient_id",
        }),
        AppointmentHistory.count({
            where: { event_type: "Rescheduled" },
            include: [
                {
                    model: Appointment,
                    as: "appointment",
                    attributes: [],
                    required: true,
                    where: appointmentWhere,
                    include: [
                        {
                            model: AppointmentStatus,
                            as: "status",
                            attributes: [],
                            required: true,
                            where: { name: "Confirmed" },
                        },
                    ],
                },
            ],
            distinct: true,
            col: "appointment_id",
        }),
        Appointment.findAll({
            attributes: [
                [col("specialty.name"), "specialty"],
                [fn("COUNT", col("Appointment.id")), "count"],
            ],
            include: [{ model: Specialities, as: "specialty", attributes: [], required: false }],
            where: appointmentWhere,
            group: ["specialty.id", "specialty.name"],
            raw: true,
        }),
        Appointment.findAll({
            attributes: [
                [col("doctor.display_name"), "doctorName"],
                [fn("COUNT", col("Appointment.id")), "count"],
            ],
            include: [{ model: Doctor, as: "doctor", attributes: [], required: false }],
            where: appointmentWhere,
            group: ["doctor.id", "doctor.display_name"],
            order: [
                [fn("COUNT", col("Appointment.id")), "DESC"],
                [col("doctor.display_name"), "ASC"],
            ],
            limit: 5,
            raw: true,
        }),
        Appointment.findAll({
            attributes: [
                [fn("DATE", col("Appointment.start_at")), "date"],
                [col("status.name"), "status"],
                [fn("COUNT", col("Appointment.id")), "count"],
            ],
            include: [{ model: AppointmentStatus, as: "status", attributes: [], required: true }],
            where: {
                ...appointmentWhere,
                "$status.name$": { [Op.in]: ["Attended", "Confirmed", "Cancelled"] },
            },
            group: [fn("DATE", col("Appointment.start_at")), col("status.name")],
            order: [[fn("DATE", col("Appointment.start_at")), "ASC"]],
            raw: true,
        }),
        Consultation.findOne({
            attributes: [[fn("AVG", col("Consultation.duration_seconds")), "averageSeconds"]],
            where: consultationWhere,
            raw: true,
        }),
        WhatsAppAppointmentRequest.count({
            where: { created_at: { [Op.gte]: range.start, [Op.lt]: range.end } },
        }),
    ]);

    const statusChart = buildStatusDistribution(statusRows, reprogrammedAppointmentCount);
    const totalAppointments = statusRows.reduce((total, row) => total + toCount(row.count), 0);
    const attendedAppointments = statusRows.find((row) => row.status === "Attended");
    const cancelledAppointments = statusRows.find((row) => row.status === "Cancelled");
    const averageSeconds =
        durationRow?.averageSeconds === null || durationRow?.averageSeconds === undefined
            ? null
            : Number(durationRow.averageSeconds);
    const dates = createDateKeys(range.start, reportDays);
    const trend = buildTrendSeries(trendRows, dates);

    return {
        period: {
            days: reportDays,
            label: `Últimos ${reportDays} días`,
            start: formatDate(dates[0]),
            end: formatDate(dates.at(-1)),
        },
        summary: {
            totalAppointments,
            attendedAppointments: toCount(attendedAppointments?.count),
            cancelledAppointments: toCount(cancelledAppointments?.count),
            uniquePatients: toCount(distinctPatientCount),
            attendedPercentage: totalAppointments
                ? Math.round((toCount(attendedAppointments?.count) / totalAppointments) * 100)
                : 0,
            cancellationRate: totalAppointments
                ? Math.round((toCount(cancelledAppointments?.count) / totalAppointments) * 100)
                : 0,
        },
        statusChart,
        specialties: buildSpecialtyDistribution(specialtyRows),
        topDoctors: buildDoctorRanking(doctorRows),
        trend,
        averageConsultationMinutes: Number.isFinite(averageSeconds)
            ? Math.round(averageSeconds / 60)
            : null,
        whatsappAppointmentRequests: toCount(whatsappRequestCount),
    };
}
