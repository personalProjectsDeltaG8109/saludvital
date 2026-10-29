import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("../../../config/database.js", () => ({
    default: {
        transaction: jest.fn(),
    },
}));

jest.unstable_mockModule("../../../src/models/associations.js", () => ({
    Appointment: { findByPk: jest.fn() },
    AppointmentStatus: {},
    Notification: {
        findAll: jest.fn(),
        update: jest.fn(),
    },
}));

jest.unstable_mockModule(
    "../../../src/modules/patient/services/notificationDeliveryService.js",
    () => ({ deliverNotification: jest.fn() }),
);

const { default: database } = await import("../../../config/database.js");
const { Appointment, Notification } = await import("../../../src/models/associations.js");
const { deliverNotification } =
    await import("../../../src/modules/patient/services/notificationDeliveryService.js");
const { processNotificationBatch } =
    await import("../../../src/modules/patient/services/notificationWorker.js");

describe("appointment notification worker", () => {
    const transaction = { LOCK: { UPDATE: "UPDATE" } };
    let notification;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date("2026-11-01T15:00:00.000Z"));
        jest.clearAllMocks();
        process.env.NOTIFICATION_DELIVERY_ENABLED = "true";

        notification = {
            id: 8,
            event_type: "appointment_cancellation",
            appointment_id: 99,
            attempt_count: 1,
            scheduled_at: new Date("2026-11-01T14:59:00.000Z"),
            update: jest.fn().mockResolvedValue(undefined),
        };
        database.transaction.mockImplementation(async (callback) => callback(transaction));
        Notification.update.mockResolvedValue([0]);
        Notification.findAll.mockResolvedValue([notification]);
        Appointment.findByPk.mockResolvedValue({
            start_at: new Date("2026-11-03T15:00:00.000Z"),
            status: { name: "Confirmed" },
        });
        deliverNotification.mockResolvedValue({ id: "SM-provider-id", status: "sent" });
    });

    afterEach(() => {
        jest.useRealTimers();
        delete process.env.NOTIFICATION_DELIVERY_ENABLED;
    });

    // Respect the global delivery switch before claiming or sending any jobs.
    test("does not claim or send jobs when automatic delivery is disabled", async () => {
        process.env.NOTIFICATION_DELIVERY_ENABLED = "false";

        await expect(processNotificationBatch()).resolves.toBe(0);

        expect(Notification.findAll).not.toHaveBeenCalled();
        expect(deliverNotification).not.toHaveBeenCalled();
    });

    // Cancel stale reminders when their appointment time or status has changed.
    test("cancels a stale reminder instead of delivering it", async () => {
        notification.event_type = "appointment_reminder";
        notification.payload = { appointmentStart: "2026-11-03T15:00:00.000Z" };
        Appointment.findByPk.mockResolvedValue({
            start_at: new Date("2026-11-04T15:00:00.000Z"),
            status: { name: "Confirmed" },
        });

        await expect(processNotificationBatch()).resolves.toBe(1);

        expect(deliverNotification).not.toHaveBeenCalled();
        expect(notification.update).toHaveBeenLastCalledWith({
            status: "Cancelled",
            last_error: "Appointment changed before reminder delivery.",
        });
    });

    // Save the provider identifier after a successful dispatch.
    test("records the provider message ID after successful delivery", async () => {
        await processNotificationBatch();

        expect(notification.update).toHaveBeenLastCalledWith(
            expect.objectContaining({
                status: "Sent",
                provider_message_id: "SM-provider-id",
                sent_at: expect.any(Date),
                last_error: null,
            }),
        );
    });

    // Retry transient provider failures using the configured progressive delay.
    test("reschedules transient provider errors for a retry", async () => {
        deliverNotification.mockRejectedValue(
            Object.assign(new Error("Temporary outage"), { statusCode: 503 }),
        );

        await processNotificationBatch();

        expect(notification.update).toHaveBeenLastCalledWith({
            status: "Pending",
            scheduled_at: new Date("2026-11-01T15:01:00.000Z"),
            last_error: "Temporary outage",
        });
    });

    // Do not retry permanent provider configuration or template failures.
    test("marks permanent provider configuration errors failed without retrying", async () => {
        deliverNotification.mockRejectedValue(
            new Error("The Meta WhatsApp sender is not configured."),
        );

        await processNotificationBatch();

        expect(notification.update).toHaveBeenLastCalledWith({
            status: "Failed",
            scheduled_at: notification.scheduled_at,
            last_error: "The Meta WhatsApp sender is not configured.",
        });
    });

    // Finish retrying once the configured attempt limit has been reached.
    test("marks a transient failure failed after the final allowed attempt", async () => {
        notification.attempt_count = 5;
        deliverNotification.mockRejectedValue(
            Object.assign(new Error("Temporary outage"), { statusCode: 503 }),
        );

        await processNotificationBatch();

        expect(notification.update).toHaveBeenLastCalledWith({
            status: "Failed",
            scheduled_at: notification.scheduled_at,
            last_error: "Temporary outage",
        });
    });
});
