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
const { getCurrentDoctorAgendaDate, getDoctorAgendaData } =
    await import("../../src/modules/doctor/services/doctorAgendaService.js");

const NOW = new Date("2026-10-29T15:00:00.000Z");

function createAppointment(overrides = {}) {
    return {
        id: 7,
        start_at: new Date("2026-10-29T13:00:00.000Z"),
        end_at: new Date("2026-10-29T13:30:00.000Z"),
        patient: {
            first_name: "Ana",
            last_name: "Pérez",
            profile_photo_url: "https://unsafe.test/photo",
        },
        status: { name: "Confirmed" },
        specialty: { name: "Medicina General" },
        ...overrides,
    };
}

describe("doctor daily agenda service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        models.Doctor.findOne.mockResolvedValue({ id: 12 });
        models.Appointment.findAll.mockResolvedValue([]);
        models.DoctorAvailability.findAll.mockResolvedValue([]);
        models.DoctorScheduleException.findAll.mockResolvedValue([]);
    });

    test("uses the Bogota calendar date as the initial date", () => {
        expect(getCurrentDoctorAgendaDate(new Date("2026-10-29T03:30:00.000Z"))).toBe("2026-10-28");
    });

    test("returns only the authenticated doctor's persisted appointments and schedule", async () => {
        models.Appointment.findAll.mockResolvedValue([createAppointment()]);
        models.DoctorAvailability.findAll.mockResolvedValue([
            { id: 1, start_time: "07:00:00", end_time: "17:00:00" },
        ]);

        const result = await getDoctorAgendaData(45, "2026-10-29", NOW);

        expect(models.Doctor.findOne).toHaveBeenCalledWith({
            where: { user_id: 45 },
            attributes: ["id"],
        });
        expect(models.Appointment.findAll.mock.calls[0][0].where).toMatchObject({
            doctor_id: 12,
            start_at: {
                [Op.gte]: new Date("2026-10-29T05:00:00.000Z"),
                [Op.lt]: new Date("2026-10-30T05:00:00.000Z"),
            },
        });
        expect(models.Appointment.findAll.mock.calls[0][0].include).toContainEqual(
            expect.objectContaining({
                as: "status",
                where: { name: "Confirmed" },
                required: true,
            }),
        );
        expect(result.appointments[0]).toMatchObject({
            patientName: "Ana Pérez",
            reason: "Medicina General",
            statusLabel: "Confirmada",
            patientPhotoUrl: null,
        });
        expect(result.workingPeriods[0]).toMatchObject({
            startMinute: 420,
            endMinute: 1020,
        });
    });

    test("does not return appointment reasons or exception notes", async () => {
        models.Appointment.findAll.mockResolvedValue([
            createAppointment({ reason: "Sensitive clinical text" }),
        ]);
        models.DoctorScheduleException.findAll.mockResolvedValue([
            {
                id: 3,
                start_at: new Date("2026-10-29T17:00:00.000Z"),
                end_at: new Date("2026-10-29T18:00:00.000Z"),
                exception_type: "Unavailable",
                reason: "Private leave reason",
            },
        ]);

        const result = await getDoctorAgendaData(45, "2026-10-29", NOW);

        expect(result.appointments[0].reason).toBe("Medicina General");
        expect(result.exceptions[0]).not.toHaveProperty("reason");
        expect(models.Appointment.findAll.mock.calls[0][0].attributes).not.toContain("reason");
    });

    test("rejects malformed dates before querying records", async () => {
        await expect(getDoctorAgendaData(45, "2026-02-30", NOW)).rejects.toMatchObject({
            statusCode: 400,
        });
        expect(models.Doctor.findOne).not.toHaveBeenCalled();
    });

    test("returns null when the authenticated account has no doctor profile", async () => {
        models.Doctor.findOne.mockResolvedValue(null);
        await expect(getDoctorAgendaData(45, "2026-10-29", NOW)).resolves.toBeNull();
        expect(models.Appointment.findAll).not.toHaveBeenCalled();
    });
});
