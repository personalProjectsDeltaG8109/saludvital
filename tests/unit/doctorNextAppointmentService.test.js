import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Op } from "sequelize";

jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: { findOne: jest.fn() },
    AppointmentStatus: {},
    Consultation: { findOne: jest.fn() },
    Doctor: { findOne: jest.fn() },
    Patient: {},
    Specialities: {},
}));

const models = await import("../../src/models/associations.js");
const { getDoctorNextAppointmentData } =
    await import("../../src/modules/doctor/services/doctorDashboardService.js");

const NOW = new Date("2026-10-29T15:00:00.000Z");

function createAppointment(overrides = {}) {
    return {
        id: 23,
        start_at: new Date("2026-10-30T14:00:00.000Z"),
        end_at: new Date("2026-10-30T14:30:00.000Z"),
        reason: "Sensitive reason excluded from the agenda summary",
        patient: { id: 4, first_name: "Ana", last_name: "Pérez" },
        specialty: { name: "Medicina General" },
        status: { name: "Confirmed" },
        ...overrides,
    };
}

describe("doctor next appointment service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        models.Doctor.findOne.mockResolvedValue({ id: 12 });
        models.Appointment.findOne.mockResolvedValue(createAppointment());
        models.Consultation.findOne.mockResolvedValue(null);
    });

    test("returns the next persisted appointment for the authenticated doctor", async () => {
        const result = await getDoctorNextAppointmentData(45, NOW);

        expect(models.Doctor.findOne).toHaveBeenCalledWith({
            where: { user_id: 45 },
            attributes: ["id", "display_name", "profile_photo_url"],
        });
        expect(models.Appointment.findOne.mock.calls[0][0]).toMatchObject({
            where: { doctor_id: 12, start_at: { [Op.gte]: NOW } },
            order: [["start_at", "ASC"]],
        });
        expect(models.Appointment.findOne.mock.calls[0][0].include).toContainEqual(
            expect.objectContaining({
                as: "status",
                required: true,
                where: { name: { [Op.in]: ["Confirmed", "In Progress"] } },
            }),
        );
        expect(result).toMatchObject({
            id: 23,
            patientName: "Ana Pérez",
            reason: "Medicina General",
            status: "Confirmed",
            canStart: true,
        });
        expect(result).not.toHaveProperty("patientPhone");
        expect(result).not.toHaveProperty("patientDocument");
        expect(result.reason).not.toContain("Sensitive");
    });

    test("returns an empty result when there is no upcoming eligible appointment", async () => {
        models.Appointment.findOne.mockResolvedValue(null);

        await expect(getDoctorNextAppointmentData(45, NOW)).resolves.toBeNull();
    });

    test("does not offer a second consultation while one is active", async () => {
        models.Consultation.findOne.mockResolvedValue({ id: 91 });

        const result = await getDoctorNextAppointmentData(45, NOW);

        expect(result.canStart).toBe(false);
    });

    test("links an in-progress appointment only to its own consultation", async () => {
        models.Appointment.findOne.mockResolvedValue(
            createAppointment({ status: { name: "In Progress" } }),
        );
        models.Consultation.findOne.mockResolvedValue({ id: 92, appointment_id: 23 });

        const result = await getDoctorNextAppointmentData(45, NOW);

        expect(result).toMatchObject({
            status: "In Progress",
            consultationId: 92,
            canStart: false,
        });
    });

    test("returns no appointment when the authenticated account has no doctor profile", async () => {
        models.Doctor.findOne.mockResolvedValue(null);

        await expect(getDoctorNextAppointmentData(45, NOW)).resolves.toBeNull();
        expect(models.Appointment.findOne).not.toHaveBeenCalled();
    });
});
