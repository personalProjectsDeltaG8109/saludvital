import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: { findOne: jest.fn() },
    AppointmentStatus: {},
    Doctor: { findOne: jest.fn() },
    Patient: {},
    Specialities: {},
}));

const models = await import("../../src/models/associations.js");
const { getDoctorAppointmentDetails } =
    await import("../../src/modules/doctor/services/doctorAppointmentDetailsService.js");

describe("doctor appointment detail service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        models.Doctor.findOne.mockResolvedValue({ id: 12 });
        models.Appointment.findOne.mockResolvedValue({
            id: 24,
            start_at: new Date("2026-12-24T12:00:00.000Z"),
            end_at: new Date("2026-12-24T12:30:00.000Z"),
            patient: {
                first_name: "Ana",
                last_name: "Pérez",
                profile_photo_url: "/uploads/patients/24.jpg",
            },
            specialty: { name: "Medicina General" },
            status: { name: "Confirmed" },
        });
    });

    test("returns only the read-only appointment details needed by its assigned doctor", async () => {
        const result = await getDoctorAppointmentDetails(45, "24");

        expect(models.Doctor.findOne).toHaveBeenCalledWith({
            where: { user_id: 45 },
            attributes: ["id"],
        });
        expect(models.Appointment.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 24, doctor_id: 12 },
                attributes: ["id", "start_at", "end_at"],
            }),
        );
        expect(result).toMatchObject({
            id: 24,
            patientName: "Ana Pérez",
            patientPhotoUrl: "/uploads/patients/24.jpg",
            specialty: "Medicina General",
            date: "jueves, 24 de diciembre de 2026",
            startTime: "07:00 a. m.",
            endTime: "07:30 a. m.",
            statusLabel: "Confirmada",
        });
        expect(result).not.toHaveProperty("documentNumber");
        expect(result).not.toHaveProperty("phone");
        expect(result).not.toHaveProperty("reason");
    });

    test.each(["0", "-2", "1.5", "abc", "9007199254740992"])(
        "rejects invalid appointment identifier %s without querying records",
        async (appointmentId) => {
            await expect(getDoctorAppointmentDetails(45, appointmentId)).rejects.toMatchObject({
                statusCode: 404,
                message: "No se encontró la cita solicitada.",
            });
            expect(models.Doctor.findOne).not.toHaveBeenCalled();
        },
    );

    test("uses the same not-found response when the appointment belongs to another doctor", async () => {
        models.Appointment.findOne.mockResolvedValue(null);

        await expect(getDoctorAppointmentDetails(45, "24")).rejects.toMatchObject({
            statusCode: 404,
            message: "No se encontró la cita solicitada.",
        });
        expect(models.Appointment.findOne.mock.calls[0][0].where).toEqual({
            id: 24,
            doctor_id: 12,
        });
    });

    test("does not return an unsafe external patient photo URL", async () => {
        models.Appointment.findOne.mockResolvedValue({
            id: 24,
            start_at: new Date("2026-12-24T12:00:00.000Z"),
            end_at: new Date("2026-12-24T12:30:00.000Z"),
            patient: { first_name: "Ana", last_name: "Pérez", profile_photo_url: "//evil.test" },
            specialty: null,
            status: { name: "Unexpected" },
        });

        const result = await getDoctorAppointmentDetails(45, "24");

        expect(result.patientPhotoUrl).toBeNull();
        expect(result.statusLabel).toBe("Estado no disponible");
        expect(result.specialty).toBe("No registrada");
    });
});
