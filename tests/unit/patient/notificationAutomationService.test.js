import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Op } from "sequelize";

jest.unstable_mockModule("../../../config/database.js", () => ({
    default: {
        transaction: jest.fn(),
    },
}));

jest.unstable_mockModule("../../../src/models/associations.js", () => ({
    Appointment: {
        findAll: jest.fn(),
        findByPk: jest.fn(),
    },
    AppointmentStatus: { findOne: jest.fn() },
    Doctor: {},
    Notification: {
        bulkCreate: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
    },
    NotificationPreference: { findAll: jest.fn() },
    Patient: { findByPk: jest.fn() },
    Specialities: {},
}));

const { default: database } = await import("../../../config/database.js");
const { Appointment, AppointmentStatus, Notification, NotificationPreference, Patient } =
    await import("../../../src/models/associations.js");
const {
    backfillUpcomingAppointmentReminders,
    cancelPendingAppointmentReminders,
    enqueueAppointmentNotifications,
} = await import("../../../src/modules/patient/services/notificationAutomationService.js");

describe("appointment notification automation", () => {
    const transaction = { LOCK: { UPDATE: "UPDATE" } };

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date("2026-11-01T15:00:00.000Z"));
        jest.clearAllMocks();
        process.env.NOTIFICATION_DELIVERY_ENABLED = "true";

        database.transaction.mockImplementation(async (callback) => callback(transaction));
        Appointment.findByPk.mockResolvedValue({
            id: 99,
            patient_id: 12,
            start_at: new Date("2026-11-03T15:00:00.000Z"),
            doctor: { display_name: "Dra. Ejemplo" },
            specialty: { name: "Medicina general" },
        });
        Patient.findByPk.mockResolvedValue({
            id: 12,
            phone: "+573001111111",
            notification_phone: "+573002222222",
            notification_whatsapp_phone: "+573003333333",
            notification_email: "notificaciones@example.com",
            user: { email: "login@example.com" },
        });
        NotificationPreference.findAll.mockResolvedValue([
            { channel: "SMS", event_type: "appointment_reminder", is_enabled: true },
            { channel: "WhatsApp", event_type: "appointment_reminder", is_enabled: false },
            { channel: "Email", event_type: "appointment_reminder", is_enabled: true },
        ]);
        Notification.bulkCreate.mockResolvedValue([]);
        Notification.update.mockResolvedValue([1]);
        AppointmentStatus.findOne.mockResolvedValue({ id: 1, name: "Confirmed" });
        Appointment.findAll.mockResolvedValue([
            { id: 99, start_at: new Date("2026-11-03T15:00:00.000Z") },
        ]);
        Notification.count.mockResolvedValue(0);
    });

    afterEach(() => {
        jest.useRealTimers();
        delete process.env.NOTIFICATION_DELIVERY_ENABLED;
    });

    // Store jobs only for enabled channels and their corresponding destinations.
    test("queues reminders only for enabled channels and their saved destinations", async () => {
        const rows = await enqueueAppointmentNotifications({
            appointmentId: 99,
            eventType: "appointment_reminder",
            transaction,
        });

        expect(rows.map(({ channel, recipient_address }) => [channel, recipient_address])).toEqual([
            ["SMS", "+573002222222"],
            ["Email", "notificaciones@example.com"],
        ]);
        expect(Notification.bulkCreate).toHaveBeenCalledWith(rows, { transaction });
    });

    // Backfill reminders for confirmed appointments whose 24-hour due time remains ahead.
    test("backfills reminders for existing appointments more than 24 hours away", async () => {
        await expect(backfillUpcomingAppointmentReminders()).resolves.toBe(2);

        const startAtFilter = Appointment.findAll.mock.calls[0][0].where.start_at;
        expect(startAtFilter[Op.gt]).toEqual(new Date("2026-11-02T15:00:00.000Z"));
        expect(Notification.bulkCreate).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    event_type: "appointment_reminder",
                    scheduled_at: new Date("2026-11-02T15:00:00.000Z"),
                }),
            ]),
            { transaction },
        );
    });

    // Rescheduling and cancellation invalidate reminders that have not been sent.
    test("cancels pending or processing reminders for a changed appointment", async () => {
        await cancelPendingAppointmentReminders(99, transaction);

        expect(Notification.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: "Cancelled" }),
            expect.objectContaining({
                where: expect.objectContaining({
                    appointment_id: 99,
                    event_type: { [Op.in]: ["appointment_reminder", "appointment_reschedule"] },
                    status: { [Op.in]: ["Pending", "Processing"] },
                }),
                transaction,
            }),
        );
    });

    // Never create jobs while the delivery feature switch is off.
    test("does not backfill reminders while automatic delivery is disabled", async () => {
        process.env.NOTIFICATION_DELIVERY_ENABLED = "false";

        await expect(backfillUpcomingAppointmentReminders()).resolves.toBe(0);

        expect(AppointmentStatus.findOne).not.toHaveBeenCalled();
        expect(Notification.bulkCreate).not.toHaveBeenCalled();
    });
});
