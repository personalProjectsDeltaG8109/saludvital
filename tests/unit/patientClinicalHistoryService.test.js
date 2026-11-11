import { jest } from "@jest/globals";

const models = {
    Appointment: {},
    Consultation: { count: jest.fn(), findAll: jest.fn(), findOne: jest.fn() },
    Diagnosis: { count: jest.fn() },
    Doctor: {},
    Patient: { findOne: jest.fn() },
    Prescription: {},
    PrescriptionItem: { count: jest.fn() },
    Specialities: {},
};

jest.unstable_mockModule("../../src/models/associations.js", () => models);
jest.unstable_mockModule("../../src/modules/patient/errors/appointmentError.js", () => ({
    AppointmentError: class AppointmentError extends Error {
        constructor(message, statusCode) {
            super(message);
            this.statusCode = statusCode;
        }
    },
}));

const { getPatientClinicalHistory, getPatientClinicalHistoryDetail } =
    await import("../../src/modules/patient/services/clinicalHistoryService.js");

function createConsultation(values = {}) {
    return {
        get: () => ({
            id: 31,
            started_at: "2026-11-09T13:00:00.000Z",
            ended_at: "2026-11-09T13:30:00.000Z",
            appointment: { specialty: { name: "Medicina General" } },
            doctor: { display_name: "Dra. Laura Vélez", profile_photo_url: "/photo.png" },
            diagnosis_count: "2",
            treatment_count: "1",
            ...values,
        }),
    };
}

describe("patient clinical history service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        models.Patient.findOne.mockResolvedValue({ id: 9 });
        models.Consultation.count.mockResolvedValue(21);
        models.Diagnosis.count.mockResolvedValue(24);
        models.PrescriptionItem.count.mockResolvedValue(12);
        models.Consultation.findAll.mockResolvedValue([createConsultation()]);
    });

    test("returns a bounded summary page without selecting clinical detail fields", async () => {
        const result = await getPatientClinicalHistory(72, { page: "2", pageSize: "10" });

        expect(models.Patient.findOne).toHaveBeenCalledWith({
            where: { user_id: 72 },
            attributes: ["id"],
        });
        const countQuery = models.Consultation.count.mock.calls[0][0];
        expect(countQuery).toMatchObject({ distinct: true, where: { status: "Completed" } });
        expect(countQuery).not.toHaveProperty("attributes");
        expect(countQuery).not.toHaveProperty("order");
        expect(models.Consultation.findAll).toHaveBeenCalledWith(
            expect.objectContaining({ limit: 10, offset: 10 }),
        );
        const query = models.Consultation.findAll.mock.calls[0][0];
        expect(query.order).toEqual([
            ["started_at", "DESC"],
            ["id", "DESC"],
        ]);
        expect(query.attributes).toEqual(expect.arrayContaining(["id", "started_at", "ended_at"]));
        expect(query.attributes).not.toContain("symptoms");
        expect(query.include.map((include) => include.as)).toEqual(["appointment", "doctor"]);
        expect(result.pagination).toMatchObject({ page: 2, total: 21, totalPages: 3 });
        expect(result.totals).toEqual({ consultations: 21, diagnoses: 24, treatments: 12 });
        expect(result.consultations[0]).toMatchObject({
            id: 31,
            specialty_label: "Medicina General",
            diagnosis_count: 2,
            treatment_count: 1,
        });
        expect(result.consultations[0]).not.toHaveProperty("diagnoses");
        expect(result.consultations[0]).not.toHaveProperty("symptoms");
    });

    test("rejects unsupported page sizes before querying clinical records", async () => {
        await expect(getPatientClinicalHistory(72, { pageSize: "11" })).rejects.toMatchObject({
            statusCode: 400,
        });
        expect(models.Consultation.findAll).not.toHaveBeenCalled();
    });

    test("retrieves detail only through a completed consultation owned by the patient", async () => {
        const detail = createConsultation({
            symptoms: "Follow-up",
            patient_feeling: "Stable",
            clinical_notes: "Clinical note",
            vital_signs: { heart_rate: "72" },
            diagnoses: [{ diagnosis: "Diagnosis", notes: "Note" }],
            prescriptions: [{ items: [{ medication_name: "Medicine" }] }],
            medical_orders: ["Order"],
        });
        models.Consultation.findOne.mockResolvedValue(detail);

        const result = await getPatientClinicalHistoryDetail(72, "31");

        const query = models.Consultation.findOne.mock.calls[0][0];
        expect(query.where).toEqual({ id: 31, status: "Completed" });
        expect(query.include[0]).toMatchObject({
            as: "appointment",
            required: true,
            where: { patient_id: 9 },
        });
        expect(query.attributes).not.toContain("interruption_reason");
        expect(result).toMatchObject({
            symptoms: "Follow-up",
            diagnoses: [{ diagnosis: "Diagnosis", notes: "Note" }],
            medical_orders: ["Order"],
        });
        expect(result).not.toHaveProperty("patient");
    });

    test("rejects invalid identifiers and returns the same safe not-found error for inaccessible records", async () => {
        await expect(getPatientClinicalHistoryDetail(72, "1 OR 1=1")).rejects.toMatchObject({
            statusCode: 400,
        });
        models.Consultation.findOne.mockResolvedValue(null);
        await expect(getPatientClinicalHistoryDetail(72, "44")).rejects.toMatchObject({
            statusCode: 404,
            message: "No encontramos la consulta solicitada.",
        });
        expect(models.Consultation.findOne).toHaveBeenCalledTimes(1);
    });
});
