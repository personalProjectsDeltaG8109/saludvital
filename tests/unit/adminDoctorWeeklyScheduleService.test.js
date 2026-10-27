import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Op } from "sequelize";

jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: { findAll: jest.fn() },
    AppointmentStatus: {},
    Doctor: { findByPk: jest.fn() },
    DoctorAvailability: { findAll: jest.fn() },
    DoctorScheduleException: { findAll: jest.fn() },
    Specialities: {},
}));

const models = await import("../../src/models/associations.js");
const { getAdminDoctorWeeklySchedule } =
    await import("../../src/modules/admin/services/adminDoctorWeeklyScheduleService.js");

function setDefaults() {
    models.Doctor.findByPk.mockResolvedValue({
        id: 7,
        display_name: "Dra. Ana Torres",
        profile_photo_url: null,
        specialty: { name: "Medicina General" },
    });
    models.DoctorAvailability.findAll.mockResolvedValue([
        {
            id: 21,
            day_of_week: 1,
            start_time: "08:00:00",
            end_time: "12:00:00",
            valid_from: "2026-01-01",
            valid_until: null,
        },
    ]);
    models.DoctorScheduleException.findAll.mockResolvedValue([
        {
            id: 41,
            exception_type: "Unavailable",
            reason: "Permiso personal",
            start_at: new Date("2026-10-27T17:00:00.000Z"),
            end_at: new Date("2026-10-27T18:00:00.000Z"),
        },
        {
            id: 42,
            exception_type: "AdditionalAvailability",
            reason: "Jornada extendida",
            start_at: new Date("2026-10-30T13:00:00.000Z"),
            end_at: new Date("2026-10-30T14:00:00.000Z"),
        },
    ]);
    models.Appointment.findAll.mockResolvedValue([
        {
            id: 51,
            start_at: new Date("2026-10-26T14:00:00.000Z"),
            end_at: new Date("2026-10-26T14:30:00.000Z"),
            status: { name: "Confirmed" },
        },
    ]);
}

describe("admin weekly doctor schedule service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setDefaults();
    });

    test("returns persisted availability, non-cancelled appointments, and unavailable exceptions for Bogota dates", async () => {
        const result = await getAdminDoctorWeeklySchedule("7", "2026-10-26");

        expect(result.doctor).toMatchObject({
            id: 7,
            name: "Dra. Ana Torres",
            specialty: "Medicina General",
        });
        expect(result.week).toEqual({ start: "2026-10-26", end: "2026-11-01" });
        expect(result.appointmentDurationMinutes).toBe(30);
        expect(result.workingDays).toEqual([
            {
                date: "2026-10-26",
                dayOfWeek: 1,
                dayLabel: "Lunes",
                intervals: [{ startTime: "08:00", endTime: "12:00" }],
            },
        ]);
        expect(result.days[0].events).toEqual([
            {
                id: 21,
                type: "available",
                label: "Disponible",
                startTime: "08:00",
                endTime: "12:00",
                reason: null,
            },
            expect.objectContaining({
                id: 51,
                type: "appointment",
                reference: "Cita #51",
                statusLabel: "Confirmada",
                startTime: "09:00",
                endTime: "09:30",
            }),
        ]);
        expect(result.days[1].events).toEqual([
            expect.objectContaining({
                type: "blocked",
                label: "No disponible",
                reason: "Permiso personal",
                startTime: "12:00",
                endTime: "13:00",
            }),
        ]);
        expect(result.days[4].events).toEqual([
            expect.objectContaining({
                type: "additionalAvailability",
                label: "Disponible adicional",
                reason: "Jornada extendida",
                startTime: "08:00",
                endTime: "09:00",
            }),
        ]);
        expect(models.DoctorScheduleException.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    doctor_id: 7,
                    exception_type: { [Op.in]: ["Unavailable", "AdditionalAvailability"] },
                }),
            }),
        );
        expect(models.Appointment.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                attributes: ["id", "start_at", "end_at"],
                include: [
                    expect.objectContaining({
                        as: "status",
                        where: { name: { [Op.in]: ["Confirmed", "In Progress", "Attended"] } },
                    }),
                ],
            }),
        );
    });

    test("returns an empty week without fabricating schedule data", async () => {
        models.DoctorAvailability.findAll.mockResolvedValue([]);
        models.DoctorScheduleException.findAll.mockResolvedValue([]);
        models.Appointment.findAll.mockResolvedValue([]);

        const result = await getAdminDoctorWeeklySchedule(7, "2026-10-26");

        expect(result.workingDays).toEqual([]);
        expect(result.days).toHaveLength(7);
        expect(result.days.every((day) => day.events.length === 0)).toBe(true);
        expect(result.appointmentDurationMinutes).toBe(30);
    });

    test("validates doctor identifiers and Monday week starts", async () => {
        await expect(getAdminDoctorWeeklySchedule("abc", "2026-10-26")).rejects.toMatchObject({
            statusCode: 400,
        });
        await expect(getAdminDoctorWeeklySchedule(7, "2026-10-27")).rejects.toMatchObject({
            statusCode: 400,
        });
    });

    test("returns not found for a missing doctor", async () => {
        models.Doctor.findByPk.mockResolvedValue(null);

        await expect(getAdminDoctorWeeklySchedule(7, "2026-10-26")).rejects.toMatchObject({
            statusCode: 404,
        });
    });
});
