import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("../../../config/database.js", () => ({
    default: { transaction: jest.fn() },
}));
jest.unstable_mockModule("../../../src/models/AuditLog.js", () => ({
    default: { create: jest.fn() },
}));

jest.unstable_mockModule("../../../src/models/associations.js", () => {
    const model = () => ({
        count: jest.fn(),
        create: jest.fn(),
        findByPk: jest.fn(),
        findOne: jest.fn(),
    });
    return {
        Appointment: model(),
        AppointmentStatus: model(),
        AppointmentHistory: model(),
        Doctor: model(),
        DoctorAvailability: model(),
        DoctorScheduleException: model(),
        Patient: model(),
        Specialities: model(),
        User: model(),
    };
});

jest.unstable_mockModule(
    "../../../src/modules/patient/services/notificationAutomationService.js",
    () => ({
        cancelPendingAppointmentReminders: jest.fn(),
        enqueueAppointmentNotifications: jest.fn(),
    }),
);

const { default: database } = await import("../../../config/database.js");
const {
    Appointment,
    AppointmentHistory,
    Doctor,
    DoctorAvailability,
    DoctorScheduleException,
    Patient,
    Specialities,
} = await import("../../../src/models/associations.js");
const { cancelPendingAppointmentReminders, enqueueAppointmentNotifications } =
    await import("../../../src/modules/patient/services/notificationAutomationService.js");
const AuditLog = (await import("../../../src/models/AuditLog.js")).default;
const { reschedulePatientAppointment } =
    await import("../../../src/modules/patient/services/appointmentService.js");

describe("appointment rescheduling", () => {
    const transaction = { LOCK: { UPDATE: "UPDATE" } };
    let appointment;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date("2026-11-01T15:00:00.000Z"));
        jest.clearAllMocks();
        database.transaction.mockImplementation(async (callback) => callback(transaction));
        Patient.findOne.mockResolvedValue({ id: 12 });
        Specialities.findOne.mockResolvedValue({ id: 5, is_active: true });
        Doctor.findByPk.mockImplementation(async (id) => ({ id }));
        Doctor.findOne.mockResolvedValue({ id: 8, specialty_id: 5 });
        Appointment.count.mockResolvedValue(0);
        AppointmentHistory.count.mockResolvedValue(0);
        DoctorAvailability.findOne.mockResolvedValue({ id: 2 });
        DoctorScheduleException.findOne.mockResolvedValue(null);
        AppointmentHistory.create.mockResolvedValue({});
        AuditLog.create.mockResolvedValue({ id: 1 });
        cancelPendingAppointmentReminders.mockResolvedValue([]);
        enqueueAppointmentNotifications.mockResolvedValue([]);

        appointment = {
            id: 17,
            patient_id: 12,
            doctor_id: 6,
            specialty_id: 3,
            status: { name: "Confirmed" },
            start_at: new Date("2026-11-02T15:30:00.000Z"),
            end_at: new Date("2026-11-02T16:00:00.000Z"),
            reason: "Seguimiento",
            update: jest.fn(),
        };
        Appointment.findOne
            .mockResolvedValueOnce({ id: 17, doctor_id: 6, specialty_id: 3 })
            .mockResolvedValueOnce(appointment)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test("updates appointment assignment and schedule while recording the administrator", async () => {
        await reschedulePatientAppointment({
            userId: 81,
            actorUserId: 5,
            actorSnapshot: "Administrator 5",
            appointmentId: 17,
            specialtyId: 5,
            doctorId: 8,
            date: "2026-11-03",
            time: "10:00",
            reason: "Nueva valoración",
        });

        expect(Doctor.findByPk.mock.calls.map(([id]) => id)).toEqual([6, 8]);
        expect(appointment.update).toHaveBeenCalledWith(
            {
                start_at: new Date("2026-11-03T15:00:00.000Z"),
                end_at: new Date("2026-11-03T15:30:00.000Z"),
                doctor_id: 8,
                specialty_id: 5,
                reason: "Nueva valoración",
            },
            { transaction },
        );
        expect(AppointmentHistory.create).toHaveBeenCalledWith(
            expect.objectContaining({
                actor_user_id: 5,
                actor_snapshot: "Administrator 5",
                event_type: "Rescheduled",
                previous_values: expect.objectContaining({
                    doctor_id: 6,
                    specialty_id: 3,
                    reason: "Seguimiento",
                }),
                new_values: expect.objectContaining({
                    doctor_id: 8,
                    specialty_id: 5,
                    reason: "Nueva valoración",
                }),
            }),
            { transaction },
        );
        expect(AuditLog.create).toHaveBeenCalledTimes(1);
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                actor_user_id: 5,
                actor_snapshot: "Administrator 5",
                action: "AdminAppointmentRescheduled",
                target_type: "Appointment",
                target_id: "17",
                changes: expect.objectContaining({
                    previous: expect.objectContaining({ startAt: expect.any(String) }),
                    next: expect.objectContaining({ startAt: expect.any(String) }),
                }),
            }),
            { transaction },
        );
        expect(JSON.stringify(AuditLog.create.mock.calls[0][0])).not.toContain("Nueva valoración");
        expect(cancelPendingAppointmentReminders).toHaveBeenCalledWith(17, transaction);
        expect(enqueueAppointmentNotifications).toHaveBeenCalledWith(
            expect.objectContaining({ appointmentId: 17, eventType: "appointment_reschedule" }),
        );
    });

    test("preserves the appointment when the requested doctor is not compatible", async () => {
        Doctor.findOne.mockResolvedValue(null);

        await expect(
            reschedulePatientAppointment({
                userId: 81,
                actorUserId: 5,
                actorSnapshot: "Administrator 5",
                appointmentId: 17,
                specialtyId: 5,
                doctorId: 8,
                date: "2026-11-03",
                time: "10:00",
            }),
        ).rejects.toMatchObject({ statusCode: 404 });

        expect(appointment.update).not.toHaveBeenCalled();
        expect(AppointmentHistory.create).not.toHaveBeenCalled();
        expect(AuditLog.create).not.toHaveBeenCalled();
    });

    test("preserves the appointment when the requested slot has a conflict", async () => {
        Appointment.findOne
            .mockReset()
            .mockResolvedValueOnce({ id: 17, doctor_id: 6, specialty_id: 3 })
            .mockResolvedValueOnce(appointment)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 21 });

        await expect(
            reschedulePatientAppointment({
                userId: 81,
                actorUserId: 5,
                actorSnapshot: "Administrator 5",
                appointmentId: 17,
                specialtyId: 5,
                doctorId: 8,
                date: "2026-11-03",
                time: "10:00",
            }),
        ).rejects.toMatchObject({ statusCode: 409 });

        expect(appointment.update).not.toHaveBeenCalled();
        expect(AppointmentHistory.create).not.toHaveBeenCalled();
    });

    test("blocks appointments outside the confirmed future lifecycle and reschedule limit", async () => {
        appointment.status = { name: "Cancelled" };
        await expect(
            reschedulePatientAppointment({
                userId: 81,
                appointmentId: 17,
                date: "2026-11-03",
                time: "10:00",
            }),
        ).rejects.toMatchObject({ statusCode: 409 });
        expect(appointment.update).not.toHaveBeenCalled();

        appointment.status = { name: "Confirmed" };
        AppointmentHistory.count.mockResolvedValueOnce(3);
        Appointment.findOne
            .mockReset()
            .mockResolvedValueOnce({ id: 17, doctor_id: 6, specialty_id: 3 })
            .mockResolvedValueOnce(appointment);
        await expect(
            reschedulePatientAppointment({
                userId: 81,
                appointmentId: 17,
                date: "2026-11-03",
                time: "10:00",
            }),
        ).rejects.toMatchObject({ statusCode: 409 });
        expect(appointment.update).not.toHaveBeenCalled();
    });
});
