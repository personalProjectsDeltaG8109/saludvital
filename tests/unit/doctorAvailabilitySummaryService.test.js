import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Op } from "sequelize";

jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: { findAll: jest.fn() },
    AppointmentStatus: {},
    Doctor: { findOne: jest.fn() },
    DoctorAvailability: { findAll: jest.fn() },
    DoctorScheduleException: { findAll: jest.fn() },
    Patient: {},
    Specialities: {},
}));

const models = await import("../../src/models/associations.js");
const { getDoctorAvailabilitySummary } =
    await import("../../src/modules/doctor/services/doctorAgendaService.js");

const NOW = new Date("2026-10-29T15:00:00.000Z");

describe("doctor availability summary service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        models.Doctor.findOne.mockResolvedValue({ id: 12 });
        models.DoctorAvailability.findAll.mockResolvedValue([
            {
                id: 1,
                day_of_week: 4,
                start_time: "09:00:00",
                end_time: "11:00:00",
                valid_from: "2026-01-01",
                valid_until: null,
            },
        ]);
        models.DoctorScheduleException.findAll.mockResolvedValue([
            {
                id: 2,
                exception_type: "Unavailable",
                start_at: new Date("2026-10-29T14:30:00.000Z"),
                end_at: new Date("2026-10-29T15:00:00.000Z"),
            },
            {
                id: 3,
                exception_type: "AdditionalAvailability",
                start_at: new Date("2026-10-29T16:00:00.000Z"),
                end_at: new Date("2026-10-29T16:30:00.000Z"),
            },
        ]);
        models.Appointment.findAll.mockResolvedValue([
            {
                id: 10,
                start_at: new Date("2026-10-29T14:00:00.000Z"),
                end_at: new Date("2026-10-29T14:30:00.000Z"),
            },
            {
                id: 11,
                start_at: new Date("2026-10-29T15:00:00.000Z"),
                end_at: new Date("2026-10-29T15:30:00.000Z"),
            },
            {
                id: 12,
                start_at: new Date("2026-10-29T16:00:00.000Z"),
                end_at: new Date("2026-10-29T16:30:00.000Z"),
            },
        ]);
    });

    test("uses the authenticated doctor and computes capacity after exceptions", async () => {
        const result = await getDoctorAvailabilitySummary(45, "2026-10-29", NOW);

        expect(models.Doctor.findOne).toHaveBeenCalledWith({
            where: { user_id: 45 },
            attributes: ["id"],
        });
        expect(result.appointmentDurationMinutes).toBe(30);
        expect(result.today).toMatchObject({
            capacitySlots: 4,
            bookedSlots: 3,
            availableSlots: 1,
            hasSchedule: true,
        });
        expect(result.today.days[0].workingPeriods).toEqual([
            "09:00 a. m. – 09:30 a. m.",
            "10:00 a. m. – 11:30 a. m.",
        ]);
        expect(result.today.days[0].exceptions).toHaveLength(2);
    });

    test("excludes cancelled appointments from occupied capacity", async () => {
        const result = await getDoctorAvailabilitySummary(45, "2026-10-29", NOW);
        const appointmentQuery = models.Appointment.findAll.mock.calls[0][0];

        expect(appointmentQuery.where.doctor_id).toBe(12);
        expect(appointmentQuery.include[0]).toMatchObject({
            as: "status",
            required: true,
            where: { name: { [Op.ne]: "Cancelled" } },
        });
        expect(result.today.bookedSlots).toBe(3);
    });

    test("counts only complete appointment slots aligned to the configured duration", async () => {
        models.DoctorAvailability.findAll.mockResolvedValue([
            {
                id: 1,
                day_of_week: 4,
                start_time: "07:15:00",
                end_time: "08:45:00",
                valid_from: "2026-01-01",
                valid_until: null,
            },
        ]);
        models.DoctorScheduleException.findAll.mockResolvedValue([]);
        models.Appointment.findAll.mockResolvedValue([
            {
                id: 14,
                start_at: new Date("2026-10-29T12:30:00.000Z"),
                end_at: new Date("2026-10-29T13:00:00.000Z"),
            },
        ]);

        const result = await getDoctorAvailabilitySummary(45, "2026-10-29", NOW);

        expect(result.today).toMatchObject({
            capacitySlots: 2,
            bookedSlots: 1,
            availableSlots: 1,
        });
    });

    test("returns a clear zero-capacity result when no schedule exists", async () => {
        models.DoctorAvailability.findAll.mockResolvedValue([]);
        models.DoctorScheduleException.findAll.mockResolvedValue([]);
        models.Appointment.findAll.mockResolvedValue([]);

        const result = await getDoctorAvailabilitySummary(45, "2026-10-29", NOW);

        expect(result.today).toMatchObject({
            capacitySlots: 0,
            bookedSlots: 0,
            availableSlots: 0,
            hasSchedule: false,
            days: [],
        });
        expect(result.week.capacitySlots).toBe(0);
        expect(result.month.capacitySlots).toBe(0);
    });

    test("does not query another doctor when the authenticated user has no profile", async () => {
        models.Doctor.findOne.mockResolvedValue(null);

        await expect(getDoctorAvailabilitySummary(45, "2026-10-29", NOW)).resolves.toBeNull();
        expect(models.Appointment.findAll).not.toHaveBeenCalled();
    });

    test("bounds the daily and selected period queries and rejects invalid dates", async () => {
        await getDoctorAvailabilitySummary(45, "2026-11-05", NOW);

        const appointmentWindows = models.Appointment.findAll.mock.calls[0][0].where[Op.or];
        expect(appointmentWindows).toHaveLength(2);
        expect(appointmentWindows[0].start_at[Op.lt]).toEqual(new Date("2026-10-30T05:00:00.000Z"));
        expect(appointmentWindows[1].end_at[Op.gt]).toEqual(new Date("2026-11-01T05:00:00.000Z"));

        await expect(getDoctorAvailabilitySummary(45, "2026-02-30", NOW)).rejects.toMatchObject({
            statusCode: 400,
        });
    });
});
