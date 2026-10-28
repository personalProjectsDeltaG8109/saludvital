import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const gte = Symbol("gte");
const lt = Symbol("lt");
const inValues = Symbol("in");
const not = Symbol("not");

jest.unstable_mockModule("sequelize", () => ({
    col: jest.fn((value) => value),
    fn: jest.fn((...values) => values),
    Op: { gte, lt, in: inValues, not },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: { findAll: jest.fn(), count: jest.fn() },
    AppointmentHistory: { count: jest.fn() },
    AppointmentStatus: {},
    Consultation: { findOne: jest.fn() },
    Doctor: {},
    Specialities: {},
}));
jest.unstable_mockModule("../../src/models/WhatsAppAppointmentRequest.js", () => ({
    default: { count: jest.fn() },
}));

const { Appointment, AppointmentHistory, Consultation } =
    await import("../../src/models/associations.js");
const WhatsAppAppointmentRequest = (await import("../../src/models/WhatsAppAppointmentRequest.js"))
    .default;
const { getAdminReportsData, parseReportPeriod } =
    await import("../../src/modules/admin/services/adminReportsService.js");

describe("administrator reports service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Appointment.findAll
            .mockResolvedValueOnce([
                { status: "Confirmed", count: "4" },
                { status: "In Progress", count: "1" },
                { status: "Attended", count: "2" },
                { status: "Cancelled", count: "1" },
            ])
            .mockResolvedValueOnce([
                { specialty: "Medicina General", count: "4" },
                { specialty: null, count: "1" },
            ])
            .mockResolvedValueOnce([
                { doctorId: 1, doctorName: "Dra. Ana Torres", count: "3" },
                { doctorId: 2, doctorName: null, count: "2" },
            ])
            .mockResolvedValueOnce([
                { date: "2026-10-01", status: "Confirmed", count: "2" },
                { date: "2026-10-01", status: "Attended", count: "1" },
                { date: "2026-10-02", status: "Cancelled", count: "1" },
            ]);
        Appointment.count.mockResolvedValue(6);
        AppointmentHistory.count.mockResolvedValue(1);
        Consultation.findOne.mockResolvedValue({ averageSeconds: "3600" });
        WhatsAppAppointmentRequest.count.mockResolvedValue(5);
    });

    test("calculates the report from persisted statuses and bounded records", async () => {
        const report = await getAdminReportsData(new Date("2026-10-27T12:00:00.000Z"));

        expect(report.period.label).toBe("Últimos 30 días");
        expect(report.period.start).toContain("28");
        expect(report.period.end).toContain("27");
        expect(report.summary).toMatchObject({
            totalAppointments: 8,
            attendedAppointments: 2,
            cancelledAppointments: 1,
            uniquePatients: 6,
            attendedPercentage: 25,
            cancellationRate: 13,
        });
        expect(report.statusChart.segments.map((segment) => segment.status)).toEqual([
            "Confirmed",
            "Cancelled",
            "Rescheduled",
        ]);
        expect(report.statusChart.segments.map((segment) => segment.count)).toEqual([3, 1, 1]);
        expect(report.statusChart.segments.map((segment) => segment.percentage)).toEqual([
            60, 20, 20,
        ]);
        expect(report.statusChart.total).toBe(5);
        expect(report.statusChart.description).not.toMatch(/En curso|Atendidas|Pendientes/i);
        expect(report.specialties).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: "Medicina General", count: 4 }),
                expect.objectContaining({ name: "Sin especialidad asignada", count: 1 }),
            ]),
        );
        expect(report.topDoctors[0]).toMatchObject({ name: "Dra. Ana Torres", count: 3, rank: 1 });
        expect(report.topDoctors[1].name).toBe("Médico sin nombre registrado");
        expect(report.trend.series.map((series) => series.label)).toEqual([
            "Atendidas",
            "Confirmadas",
            "Canceladas",
        ]);
        expect(report.trend.total).toBe(4);
        expect(report.averageConsultationMinutes).toBe(60);
        expect(report.whatsappAppointmentRequests).toBe(5);

        const query = Appointment.findAll.mock.calls[0][0];
        expect(query.where.start_at[gte]).toEqual(new Date("2026-09-28T05:00:00.000Z"));
        expect(query.where.start_at[lt]).toEqual(new Date("2026-10-28T05:00:00.000Z"));
        expect(query.where["$status.name$"][inValues]).toEqual([
            "Confirmed",
            "In Progress",
            "Attended",
            "Cancelled",
        ]);
        expect(Appointment.count).toHaveBeenCalledWith(
            expect.objectContaining({ distinct: true, col: "patient_id" }),
        );
        expect(AppointmentHistory.count).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { event_type: "Rescheduled" },
                distinct: true,
                col: "appointment_id",
            }),
        );
        expect(Consultation.findOne.mock.calls[0][0].where).toMatchObject({
            status: "Completed",
            duration_seconds: { [not]: null },
        });
        expect(Consultation.findOne.mock.calls[0][0].where.ended_at).toEqual({
            [gte]: new Date("2026-09-28T05:00:00.000Z"),
            [lt]: new Date("2026-10-28T05:00:00.000Z"),
        });
        expect(WhatsAppAppointmentRequest.count.mock.calls[0][0].where.created_at[gte]).toEqual(
            new Date("2026-09-28T05:00:00.000Z"),
        );
    });

    test("returns useful empty values when records or consultation durations are unavailable", async () => {
        Appointment.findAll.mockReset();
        Appointment.findAll.mockResolvedValue([]);
        Appointment.count.mockResolvedValue(0);
        AppointmentHistory.count.mockResolvedValue(0);
        Consultation.findOne.mockResolvedValue({ averageSeconds: null });
        WhatsAppAppointmentRequest.count.mockResolvedValue(0);

        const report = await getAdminReportsData(new Date("2026-10-27T12:00:00.000Z"));

        expect(report.summary.totalAppointments).toBe(0);
        expect(report.summary.cancellationRate).toBeNull();
        expect(report.statusChart.description).toBe(
            "No hay citas confirmadas, canceladas o reprogramadas en el período.",
        );
        expect(report.statusChart.style).toContain("#e8eef7");
        expect(report.specialties).toEqual([]);
        expect(report.topDoctors).toEqual([]);
        expect(report.averageConsultationMinutes).toBeNull();
        expect(report.whatsappAppointmentRequests).toBe(0);
    });

    test("ranks five doctors by count, then name and doctor ID, within the selected period", async () => {
        Appointment.findAll.mockReset();
        Appointment.findAll
            .mockResolvedValueOnce([
                { status: "Confirmed", count: "6" },
                { status: "Cancelled", count: "1" },
            ])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                { doctorId: 6, doctorName: "Dra. Zeta", count: "4" },
                { doctorId: 2, doctorName: "Dra. Ana Torres", count: "10" },
                { doctorId: 5, doctorName: "Dra. Elena", count: "7" },
                { doctorId: 1, doctorName: "Dra. Ana Torres", count: "10" },
                { doctorId: 4, doctorName: "Dr. Carlos", count: "8" },
                { doctorId: 3, doctorName: "Dra. Ana Suarez", count: "10" },
            ])
            .mockResolvedValueOnce([]);

        const report = await getAdminReportsData(new Date("2026-10-27T12:00:00.000Z"), 7);

        expect(report.topDoctors).toEqual([
            { name: "Dra. Ana Suarez", count: 10, rank: 1, width: 100 },
            { name: "Dra. Ana Torres", count: 10, rank: 2, width: 100 },
            { name: "Dra. Ana Torres", count: 10, rank: 3, width: 100 },
            { name: "Dr. Carlos", count: 8, rank: 4, width: 80 },
            { name: "Dra. Elena", count: 7, rank: 5, width: 70 },
        ]);

        const rankingQuery = Appointment.findAll.mock.calls[2][0];
        expect(rankingQuery.where.start_at[gte]).toEqual(new Date("2026-10-21T05:00:00.000Z"));
        expect(rankingQuery.where.start_at[lt]).toEqual(new Date("2026-10-28T05:00:00.000Z"));
        expect(rankingQuery.limit).toBe(5);
        expect(rankingQuery.order.slice(1)).toEqual([
            ["doctor.display_name", "ASC"],
            ["doctor.id", "ASC"],
        ]);
        expect(rankingQuery.include.some((include) => include.as === "history")).toBe(false);
    });

    test.each([
        [7, new Date("2026-10-21T05:00:00.000Z")],
        [30, new Date("2026-09-28T05:00:00.000Z")],
        [90, new Date("2026-07-30T05:00:00.000Z")],
    ])("applies the same Bogota date range to every metric for %i days", async (days, start) => {
        const report = await getAdminReportsData(new Date("2026-10-27T12:00:00.000Z"), days);
        const end = new Date("2026-10-28T05:00:00.000Z");
        const appointmentQueries = Appointment.findAll.mock.calls.map(([query]) => query);

        expect(report.period.days).toBe(days);
        expect(report.period.label).toBe(`Últimos ${days} días`);
        expect(report.trend.dates).toHaveLength(days);
        expect(appointmentQueries).toHaveLength(4);
        for (const query of appointmentQueries) {
            expect(query.where.start_at[gte]).toEqual(start);
            expect(query.where.start_at[lt]).toEqual(end);
        }
        expect(Appointment.count.mock.calls[0][0].where.start_at).toEqual({
            [gte]: start,
            [lt]: end,
        });
        expect(AppointmentHistory.count.mock.calls[0][0].include[0].where.start_at).toEqual({
            [gte]: start,
            [lt]: end,
        });
        expect(Consultation.findOne.mock.calls[0][0].where.ended_at).toEqual({
            [gte]: start,
            [lt]: end,
        });
        expect(WhatsAppAppointmentRequest.count.mock.calls[0][0].where.created_at).toEqual({
            [gte]: start,
            [lt]: end,
        });
    });

    test("defaults to 30 days and rejects unsupported period values", () => {
        expect(parseReportPeriod(undefined)).toBe(30);
        expect(parseReportPeriod("7")).toBe(7);
        expect(parseReportPeriod("90")).toBe(90);
        expect(() => parseReportPeriod("14")).toThrow("El período seleccionado no es válido.");
        expect(() => parseReportPeriod(["7"])).toThrow("El período seleccionado no es válido.");
    });
});
