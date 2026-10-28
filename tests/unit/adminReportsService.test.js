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
    AppointmentStatus: {},
    Consultation: { findOne: jest.fn() },
    Doctor: {},
    Specialities: {},
}));
jest.unstable_mockModule("../../src/models/WhatsAppAppointmentRequest.js", () => ({
    default: { count: jest.fn() },
}));

const { Appointment, Consultation } = await import("../../src/models/associations.js");
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
                { doctorName: "Dra. Ana Torres", count: "3" },
                { doctorName: null, count: "2" },
            ])
            .mockResolvedValueOnce([
                { date: "2026-10-01", status: "Confirmed", count: "2" },
                { date: "2026-10-01", status: "Attended", count: "1" },
                { date: "2026-10-02", status: "Cancelled", count: "1" },
            ]);
        Appointment.count.mockResolvedValue(6);
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
            "In Progress",
            "Attended",
            "Cancelled",
        ]);
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
        expect(Consultation.findOne.mock.calls[0][0].where.status).toBe("Completed");
        expect(WhatsAppAppointmentRequest.count.mock.calls[0][0].where.created_at[gte]).toEqual(
            new Date("2026-09-28T05:00:00.000Z"),
        );
    });

    test("returns useful empty values when records or consultation durations are unavailable", async () => {
        Appointment.findAll.mockReset();
        Appointment.findAll.mockResolvedValue([]);
        Appointment.count.mockResolvedValue(0);
        Consultation.findOne.mockResolvedValue({ averageSeconds: null });
        WhatsAppAppointmentRequest.count.mockResolvedValue(0);

        const report = await getAdminReportsData(new Date("2026-10-27T12:00:00.000Z"));

        expect(report.summary.totalAppointments).toBe(0);
        expect(report.statusChart.description).toBe("No hay citas para mostrar en el período.");
        expect(report.statusChart.style).toContain("#e8eef7");
        expect(report.specialties).toEqual([]);
        expect(report.topDoctors).toEqual([]);
        expect(report.averageConsultationMinutes).toBeNull();
        expect(report.whatsappAppointmentRequests).toBe(0);
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
        expect(Consultation.findOne.mock.calls[0][0].where.started_at).toEqual({
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
