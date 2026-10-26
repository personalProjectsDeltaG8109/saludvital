import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: { findByPk: jest.fn() },
    AppointmentHistory: { count: jest.fn() },
}));

jest.unstable_mockModule(
    "../../src/modules/admin/services/adminAppointmentCreationService.js",
    () => ({
        getAdminAppointmentBookingDoctors: jest.fn(),
    }),
);

jest.unstable_mockModule("../../src/modules/patient/services/appointmentService.js", () => ({
    getAvailableSpecialties: jest.fn(),
    reschedulePatientAppointment: jest.fn(),
}));

const { Appointment, AppointmentHistory } = await import("../../src/models/associations.js");
const { getAdminAppointmentBookingDoctors } =
    await import("../../src/modules/admin/services/adminAppointmentCreationService.js");
const { getAvailableSpecialties, reschedulePatientAppointment } =
    await import("../../src/modules/patient/services/appointmentService.js");
const {
    getAdminAppointmentEditDoctors,
    getAdminAppointmentEditSpecialties,
    getAdminAppointmentForEditing,
    updateAdminAppointment,
} = await import("../../src/modules/admin/services/adminAppointmentEditingService.js");

function createAppointment({ status = "Confirmed", startAt = "2026-11-04T15:30:00.000Z" } = {}) {
    return {
        id: 17,
        start_at: new Date(startAt),
        end_at: new Date(new Date(startAt).getTime() + 30 * 60 * 1000),
        patient_id: 8,
        doctor_id: 6,
        specialty_id: 3,
        reason: "Seguimiento",
        patient: { id: 8, first_name: "María", last_name: "López" },
        doctor: { id: 6, display_name: "Dra. Ana Torres" },
        specialty: { id: 3, name: "Pediatría" },
        status: { id: 1, name: status },
    };
}

describe("admin appointment editing service", () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date("2026-10-26T15:00:00.000Z"));
        jest.clearAllMocks();
        Appointment.findByPk.mockResolvedValue({
            ...createAppointment(),
            patient: { ...createAppointment().patient, user_id: 81 },
        });
        AppointmentHistory.count.mockResolvedValue(1);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test("prefills current appointment data and exposes lifecycle permissions", async () => {
        await expect(getAdminAppointmentForEditing("17")).resolves.toEqual({
            id: 17,
            startAt: "2026-11-04T15:30:00.000Z",
            endAt: "2026-11-04T16:00:00.000Z",
            currentDate: "2026-11-04",
            currentDateLabel: "miércoles, 4 de noviembre de 2026",
            currentTime: "10:30",
            patient: { id: 8, name: "María López" },
            doctor: { id: 6, name: "Dra. Ana Torres" },
            specialty: { id: 3, name: "Pediatría" },
            status: "Confirmed",
            statusLabel: "Confirmada",
            reason: "Seguimiento",
            canEdit: true,
            unavailableMessage: "",
            reschedulesRemaining: 2,
        });
    });

    test("prevents editing non-confirmed, started, and exhausted appointments", async () => {
        Appointment.findByPk.mockResolvedValueOnce(createAppointment({ status: "Attended" }));
        await expect(getAdminAppointmentForEditing(17)).resolves.toMatchObject({
            canEdit: false,
            unavailableMessage: "Solo se pueden editar citas confirmadas.",
        });

        Appointment.findByPk.mockResolvedValueOnce(
            createAppointment({ startAt: "2026-10-25T15:30:00.000Z" }),
        );
        await expect(getAdminAppointmentForEditing(17)).resolves.toMatchObject({
            canEdit: false,
            unavailableMessage: "Esta cita ya inició y no se puede editar.",
        });

        AppointmentHistory.count.mockResolvedValueOnce(3);
        Appointment.findByPk.mockResolvedValueOnce(createAppointment());
        await expect(getAdminAppointmentForEditing(17)).resolves.toMatchObject({
            canEdit: false,
            unavailableMessage: "Esta cita ya alcanzó el límite de reprogramaciones.",
        });
    });

    test("uses existing active specialty and doctor lookup services", async () => {
        getAvailableSpecialties.mockResolvedValue([{ id: 3, name: "Pediatría" }]);
        getAdminAppointmentBookingDoctors.mockResolvedValue([{ id: 6, name: "Dra. Ana Torres" }]);

        await expect(getAdminAppointmentEditSpecialties()).resolves.toEqual([
            { id: 3, name: "Pediatría" },
        ]);
        await expect(getAdminAppointmentEditDoctors(3)).resolves.toEqual([
            { id: 6, name: "Dra. Ana Torres" },
        ]);
    });

    test("delegates edits to the existing transactional reschedule service", async () => {
        reschedulePatientAppointment.mockResolvedValue({ id: 17 });

        await expect(
            updateAdminAppointment(4, "17", {
                doctorId: "7",
                specialtyId: "5",
                date: "2026-11-05",
                time: "11:00",
                reason: "Nueva valoración",
            }),
        ).resolves.toEqual({ id: 17 });
        expect(reschedulePatientAppointment).toHaveBeenCalledWith({
            userId: 81,
            actorUserId: 4,
            actorSnapshot: "Administrator 4",
            appointmentId: 17,
            doctorId: "7",
            specialtyId: "5",
            date: "2026-11-05",
            time: "11:00",
            reason: "Nueva valoración",
        });

        Appointment.findByPk.mockResolvedValueOnce(null);
        await expect(updateAdminAppointment(4, 99, {})).rejects.toMatchObject({ statusCode: 404 });
    });
});
