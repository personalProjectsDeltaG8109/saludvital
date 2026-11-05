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
jest.unstable_mockModule("../../src/models/AuditLog.js", () => ({
    default: { create: jest.fn() },
}));

const database = (await import("../../config/database.js")).default;
const models = await import("../../src/models/associations.js");
const AuditLog = (await import("../../src/models/AuditLog.js")).default;
const { getActiveDoctorConsultationId, saveDoctorConsultationDraft, startDoctorConsultation } =
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

    test("returns only the active consultation owned by the signed-in doctor's profile", async () => {
        models.Doctor.findOne.mockResolvedValue({ id: 12 });
        models.Consultation.findOne.mockResolvedValue({ id: 88 });

        await expect(getActiveDoctorConsultationId(45)).resolves.toBe(88);
        expect(models.Doctor.findOne).toHaveBeenCalledWith({
            where: { user_id: 45 },
            attributes: ["id"],
            raw: true,
        });
        expect(models.Consultation.findOne).toHaveBeenCalledWith({
            where: { doctor_id: 12, status: "InProgress" },
            attributes: ["id"],
            raw: true,
        });
    });

    test("returns no active consultation when the doctor has none", async () => {
        models.Consultation.findOne.mockResolvedValue(null);

        await expect(getActiveDoctorConsultationId(45)).resolves.toBeNull();
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
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({ action: "DoctorConsultationStarted" }),
            expect.any(Object),
        );
        expect(result.consultation.id).toBe(88);
    });

    test("allows a late consultation for a no-show appointment and records the correction", async () => {
        models.AppointmentStatus.findByPk.mockResolvedValue({ id: 5, name: "No Show" });

        await startDoctorConsultation(45, "7");

        expect(models.AppointmentHistory.create).toHaveBeenCalledWith(
            expect.objectContaining({
                event_type: "ConsultationStarted",
                previous_values: { status: "No Show" },
                new_values: expect.objectContaining({ status: "In Progress" }),
            }),
            expect.any(Object),
        );
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "DoctorConsultationStarted",
                changes: {
                    previous: { status: "No Show" },
                    next: { status: "In Progress" },
                },
                reason: "Doctor started the consultation after the patient arrived late.",
            }),
            expect.any(Object),
        );
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

    test.each([
        ["consultation reason", { symptoms: "x".repeat(501) }],
        ["patient condition", { patientFeeling: "x".repeat(501) }],
        ["medical evaluation", { clinicalNotes: "x".repeat(1501) }],
        ["diagnosis", { diagnoses: [{ diagnosis: "x".repeat(201) }] }],
        ["diagnosis notes", { diagnoses: [{ diagnosis: "Test", notes: "x".repeat(201) }] }],
        [
            "medication name",
            {
                prescriptionItems: [
                    {
                        medicationName: "x".repeat(151),
                        dosage: "1 mg",
                        frequency: "Daily",
                        duration: "5 days",
                    },
                ],
            },
        ],
        [
            "medication dosage",
            {
                prescriptionItems: [
                    {
                        medicationName: "Test",
                        dosage: "x".repeat(101),
                        frequency: "Daily",
                        duration: "5 days",
                    },
                ],
            },
        ],
        [
            "medication frequency",
            {
                prescriptionItems: [
                    {
                        medicationName: "Test",
                        dosage: "1 mg",
                        frequency: "x".repeat(101),
                        duration: "5 days",
                    },
                ],
            },
        ],
        [
            "medication duration",
            {
                prescriptionItems: [
                    {
                        medicationName: "Test",
                        dosage: "1 mg",
                        frequency: "Daily",
                        duration: "x".repeat(101),
                    },
                ],
            },
        ],
        [
            "medication instructions",
            {
                prescriptionItems: [
                    {
                        medicationName: "Test",
                        dosage: "1 mg",
                        frequency: "Daily",
                        duration: "5 days",
                        instructions: "x".repeat(1001),
                    },
                ],
            },
        ],
        ["medical order line", { medicalOrders: ["x".repeat(301)] }],
        ["medical order count", { medicalOrders: Array.from({ length: 31 }, () => "Order") }],
        ["zero blood pressure", { vitalSigns: { bloodPressure: "00/00" } }],
        ["zero heart rate", { vitalSigns: { heartRate: 0 } }],
        ["zero weight", { vitalSigns: { weight: 0 } }],
        ["zero height", { vitalSigns: { height: 0 } }],
        ["unsupported temperature precision", { vitalSigns: { temperature: 36.55 } }],
        ["unsupported weight precision", { vitalSigns: { weight: 70.55 } }],
        ["unsupported height precision", { vitalSigns: { height: 1.755 } }],
    ])("rejects draft values beyond the supported %s limit", async (_fieldName, overrides) => {
        const payload = {
            symptoms: "Reason",
            patientFeeling: "Stable",
            clinicalNotes: "Evaluation",
            recommendations: "",
            medicalOrders: [],
            vitalSigns: null,
            diagnoses: [],
            prescriptionItems: [],
            ...overrides,
        };

        await expect(saveDoctorConsultationDraft(45, 88, payload)).rejects.toMatchObject({
            statusCode: 400,
        });
        expect(database.transaction).not.toHaveBeenCalled();
    });

    test("accepts atypical vital signs within technical bounds without blocking draft saving", async () => {
        const consultation = { id: 88, status: "InProgress", appointment_id: 7, update: jest.fn() };
        models.Doctor.findOne.mockResolvedValue({ id: 12 });
        models.Consultation.findOne.mockResolvedValue(consultation);
        models.Appointment.findOne.mockResolvedValue(appointment);
        models.Diagnosis.destroy = jest.fn();
        models.Diagnosis.bulkCreate = jest.fn();
        models.Prescription.findAll = jest.fn().mockResolvedValue([]);

        await expect(
            saveDoctorConsultationDraft(45, 88, {
                symptoms: "Motivo",
                patientFeeling: "Estable",
                clinicalNotes: "Evaluación",
                recommendations: "",
                medicalOrders: [],
                vitalSigns: {
                    bloodPressure: "180/120",
                    heartRate: 140,
                    temperature: 39,
                    weight: 70,
                    height: 1.7,
                },
                diagnoses: [],
                prescriptionItems: [],
            }),
        ).resolves.toMatchObject({ message: "Borrador guardado correctamente." });

        expect(consultation.update).toHaveBeenCalledWith(
            expect.objectContaining({ vital_signs: expect.objectContaining({ heartRate: 140 }) }),
            expect.any(Object),
        );
    });
});
