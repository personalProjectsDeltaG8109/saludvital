import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("../../../config/database.js", () => ({
    default: {
        transaction: jest.fn(),
    },
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
    AppointmentStatus,
    AppointmentHistory,
    Doctor,
    DoctorAvailability,
    DoctorScheduleException,
    Patient,
    Specialities,
} = await import("../../../src/models/associations.js");
const { enqueueAppointmentNotifications } =
    await import("../../../src/modules/patient/services/notificationAutomationService.js");
const { bookAppointment } =
    await import("../../../src/modules/patient/services/appointmentService.js");

describe("appointment reminder scheduling", () => {
    const transaction = { LOCK: { UPDATE: "UPDATE" } };

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date("2026-11-01T15:00:00.000Z"));
        jest.clearAllMocks();

        database.transaction.mockImplementation(async (callback) => callback(transaction));
        Patient.findOne.mockResolvedValue({ id: 12 });
        Specialities.findOne.mockResolvedValue({ id: 4, is_active: true });
        Doctor.findOne.mockResolvedValue({ id: 7, specialty_id: 4 });
        Doctor.findByPk.mockResolvedValue({ id: 7 });
        Appointment.count.mockResolvedValue(0);
        Appointment.findOne.mockResolvedValue(null);
        DoctorAvailability.findOne.mockResolvedValue({ id: 3 });
        DoctorScheduleException.findOne.mockResolvedValue(null);
        AppointmentStatus.findOne.mockResolvedValue({ id: 1, name: "Confirmed" });
        Appointment.create.mockResolvedValue({ id: 99 });
        AppointmentHistory.create.mockResolvedValue({});
        enqueueAppointmentNotifications.mockResolvedValue([]);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    // Queue a reminder at the exact 24-hour boundary for a booking with enough notice.
    test("queues a reminder 24 hours before an appointment booked more than 24 hours ahead", async () => {
        await bookAppointment({
            userId: 2,
            specialtyId: 4,
            doctorId: 7,
            date: "2026-11-02",
            time: "10:30",
        });

        expect(enqueueAppointmentNotifications).toHaveBeenCalledWith({
            appointmentId: 99,
            eventType: "appointment_reminder",
            scheduledAt: new Date("2026-11-01T15:30:00.000Z"),
            transaction,
        });
    });

    // A booking less than 24 hours ahead must not enqueue an already-due reminder.
    test("does not queue a late reminder for an appointment booked less than 24 hours ahead", async () => {
        await bookAppointment({
            userId: 2,
            specialtyId: 4,
            doctorId: 7,
            date: "2026-11-02",
            time: "09:30",
        });

        expect(enqueueAppointmentNotifications).not.toHaveBeenCalled();
    });

    test("creates an administrator booking against the selected active patient", async () => {
        Patient.findByPk.mockResolvedValue({ id: 12, user_id: 22 });

        await bookAppointment({
            patientId: 12,
            actorUserId: 5,
            actorSnapshot: "Administrator 5",
            source: "Admin",
            specialtyId: 4,
            doctorId: 7,
            date: "2026-11-02",
            time: "10:30",
        });

        expect(Patient.findByPk).toHaveBeenCalledWith(
            12,
            expect.objectContaining({
                transaction,
                include: [
                    expect.objectContaining({
                        where: { is_active: true },
                    }),
                ],
            }),
        );
        expect(Appointment.create).toHaveBeenCalledWith(
            expect.objectContaining({
                patient_id: 12,
                status_id: 1,
                source: "Admin",
            }),
            { transaction },
        );
        expect(AppointmentHistory.create).toHaveBeenCalledWith(
            expect.objectContaining({
                actor_user_id: 5,
                actor_snapshot: "Administrator 5",
            }),
            { transaction },
        );
    });

    test("rejects invalid administrator booking fields before creating an appointment", async () => {
        await expect(
            bookAppointment({
                patientId: 12,
                actorUserId: 5,
                actorSnapshot: "Administrator 5",
                specialtyId: "3.5",
                doctorId: 7,
                date: "2026-11-02",
                time: "10:30",
            }),
        ).rejects.toMatchObject({ statusCode: 400 });

        await expect(
            bookAppointment({
                patientId: 12,
                actorUserId: 5,
                actorSnapshot: "Administrator 5",
                specialtyId: 4,
                doctorId: 7,
                date: "2026-02-30",
                time: "10:30",
            }),
        ).rejects.toMatchObject({ statusCode: 400 });

        await expect(
            bookAppointment({
                patientId: 12,
                actorUserId: 5,
                actorSnapshot: "Administrator 5",
                specialtyId: 4,
                doctorId: 7,
                date: "2026-11-02",
                time: "10:30",
                reason: "x".repeat(501),
            }),
        ).rejects.toMatchObject({ statusCode: 400 });

        expect(Appointment.create).not.toHaveBeenCalled();
    });

    test("rejects new bookings when the selected specialty is inactive", async () => {
        Specialities.findOne.mockResolvedValue(null);

        await expect(
            bookAppointment({
                userId: 2,
                specialtyId: 4,
                doctorId: 7,
                date: "2026-11-02",
                time: "10:30",
            }),
        ).rejects.toMatchObject({ statusCode: 404 });

        expect(Specialities.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 4, is_active: true }, transaction }),
        );
        expect(Appointment.create).not.toHaveBeenCalled();
    });
});
