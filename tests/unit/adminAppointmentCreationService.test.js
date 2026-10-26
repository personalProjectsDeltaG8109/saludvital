import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Patient: { findAll: jest.fn(), findByPk: jest.fn() },
    User: {},
}));

jest.unstable_mockModule("../../src/modules/patient/services/appointmentService.js", () => ({
    bookAppointment: jest.fn(),
    getAvailableDoctors: jest.fn(),
    getAvailableSpecialties: jest.fn(),
    getAvailableTimeSlots: jest.fn(),
}));

const { Patient } = await import("../../src/models/associations.js");
const { bookAppointment, getAvailableDoctors, getAvailableSpecialties, getAvailableTimeSlots } =
    await import("../../src/modules/patient/services/appointmentService.js");
const {
    createAdminAppointment,
    getAdminAppointmentBookingDoctors,
    getAdminAppointmentBookingOptions,
    getAdminAppointmentBookingTimes,
} = await import("../../src/modules/admin/services/adminAppointmentCreationService.js");

describe("admin appointment creation service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("returns active patients and bookable specialties without extra account data", async () => {
        Patient.findAll.mockResolvedValue([
            {
                id: 8,
                first_name: "María",
                last_name: "López",
                document_type: "CC",
                document_number: "123456",
            },
        ]);
        getAvailableSpecialties.mockResolvedValue([{ id: 3, name: "Pediatría" }]);

        await expect(getAdminAppointmentBookingOptions()).resolves.toEqual({
            patients: [{ id: 8, name: "María López", document: "CC 123456" }],
            specialties: [{ id: 3, name: "Pediatría" }],
        });
        expect(Patient.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                include: [
                    expect.objectContaining({
                        where: { is_active: true },
                        attributes: [],
                    }),
                ],
            }),
        );
    });

    test("returns active doctors assigned to the requested specialty", async () => {
        getAvailableDoctors.mockResolvedValue([
            { id: 6, display_name: "Dra. Ana Torres", profile_photo_url: "/doctor.jpg" },
        ]);

        await expect(getAdminAppointmentBookingDoctors("3")).resolves.toEqual([
            { id: 6, name: "Dra. Ana Torres", photoUrl: "/doctor.jpg" },
        ]);
    });

    test("checks patient and doctor compatibility before returning available times", async () => {
        getAvailableDoctors.mockResolvedValue([{ id: 6 }]);
        Patient.findByPk.mockResolvedValue({ id: 8, user_id: 81 });
        getAvailableTimeSlots.mockResolvedValue(["10:00"]);

        await expect(
            getAdminAppointmentBookingTimes({
                patientId: "8",
                specialtyId: "3",
                doctorId: "6",
                date: "2026-11-04",
            }),
        ).resolves.toEqual(["10:00"]);
        expect(getAvailableTimeSlots).toHaveBeenCalledWith(6, "2026-11-04", 81);

        await expect(
            getAdminAppointmentBookingTimes({
                patientId: 8,
                specialtyId: 3,
                doctorId: 7,
                date: "2026-11-04",
            }),
        ).rejects.toMatchObject({ statusCode: 404 });
    });

    test("delegates creation to the existing booking transaction with the administrator as actor", async () => {
        bookAppointment.mockResolvedValue({ id: 91 });

        await expect(
            createAdminAppointment(4, {
                patientId: "8",
                specialtyId: "3",
                doctorId: "6",
                date: "2026-11-04",
                time: "10:00",
                reason: "Control general",
            }),
        ).resolves.toEqual({ id: 91 });

        expect(bookAppointment).toHaveBeenCalledWith({
            patientId: 8,
            actorUserId: 4,
            actorSnapshot: "Administrator 4",
            source: "Admin",
            specialtyId: "3",
            doctorId: "6",
            date: "2026-11-04",
            time: "10:00",
            reason: "Control general",
        });
        await expect(createAdminAppointment(4, { patientId: "bad" })).rejects.toMatchObject({
            statusCode: 400,
        });
    });
});
