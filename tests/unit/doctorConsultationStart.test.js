import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("../../config/database.js", () => ({
    default: {
        transaction: jest.fn((callback) => callback({ LOCK: { UPDATE: "UPDATE" } })),
    },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: { findOne: jest.fn() },
    AppointmentHistory: { create: jest.fn() },
    AppointmentStatus: { findByPk: jest.fn(), findOne: jest.fn() },
    Consultation: { findOne: jest.fn(), create: jest.fn() },
    Diagnosis: {},
    Doctor: { findOne: jest.fn() },
    Patient: {},
    Prescription: {},
    PrescriptionItem: {},
    Specialities: {},
}));

const models = await import("../../src/models/associations.js");
const { startDoctorConsultation } =
    await import("../../src/modules/doctor/services/doctorConsultationService.js");

describe("start doctor consultation", () => {
    let appointment;

    beforeEach(() => {
        jest.clearAllMocks();
        appointment = { id: 7, status_id: 1, update: jest.fn() };
        models.Doctor.findOne.mockResolvedValue({ id: 12 });
        models.Appointment.findOne.mockResolvedValue(appointment);
        models.AppointmentStatus.findByPk.mockResolvedValue({ id: 1, name: "Confirmed" });
        models.AppointmentStatus.findOne.mockResolvedValue({ id: 2, name: "In Progress" });
        models.Consultation.findOne.mockResolvedValue(null);
        models.Consultation.create.mockResolvedValue({
            id: 88,
            status: "InProgress",
            started_at: new Date("2026-10-29T15:00:00.000Z"),
        });
    });

    test("starts an assigned confirmed appointment and records its transition", async () => {
        const result = await startDoctorConsultation(45, "7");

        expect(models.Appointment.findOne.mock.calls[0][0].where).toEqual({
            id: 7,
            doctor_id: 12,
        });
        expect(models.Consultation.create).toHaveBeenCalled();
        expect(appointment.update).toHaveBeenCalledWith({ status_id: 2 }, expect.any(Object));
        expect(models.AppointmentHistory.create).toHaveBeenCalled();
        expect(result.consultation.id).toBe(88);
    });

    test("rejects an appointment that is not assigned to the doctor", async () => {
        models.Appointment.findOne.mockResolvedValue(null);

        await expect(startDoctorConsultation(45, "7")).rejects.toMatchObject({ statusCode: 404 });
        expect(models.Consultation.create).not.toHaveBeenCalled();
    });

    test("rejects cancelled appointments", async () => {
        models.AppointmentStatus.findByPk.mockResolvedValue({ id: 3, name: "Cancelled" });

        await expect(startDoctorConsultation(45, "7")).rejects.toMatchObject({ statusCode: 409 });
        expect(models.Consultation.create).not.toHaveBeenCalled();
    });

    test("rejects starting another consultation while one is active", async () => {
        models.Consultation.findOne.mockResolvedValue({ id: 80 });

        await expect(startDoctorConsultation(45, "7")).rejects.toMatchObject({ statusCode: 409 });
        expect(models.Consultation.create).not.toHaveBeenCalled();
    });
});
