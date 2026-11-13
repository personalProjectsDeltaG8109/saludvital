import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Op, col, fn, where } from "sequelize";

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
    let previousNodeEnv;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date("2026-11-01T15:00:00.000Z"));
        jest.clearAllMocks();
        previousNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "test";
        process.env.NOTIFICATION_DELIVERY_ENABLED = "true";
        process.env.NOTIFICATION_TEST_RECIPIENTS = "notification-test@example.test";

        notification = {
            id: 8,
            recipient_address: "notification-test@example.test",
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
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
        delete process.env.NOTIFICATION_DELIVERY_ENABLED;
        delete process.env.NOTIFICATION_TEST_RECIPIENTS;
    });

    // Respect the global delivery switch before claiming or sending any jobs.
    test("does not claim or send jobs when automatic delivery is disabled", async () => {
        process.env.NOTIFICATION_DELIVERY_ENABLED = "false";

        await expect(processNotificationBatch()).resolves.toBe(0);

        expect(Notification.findAll).not.toHaveBeenCalled();
        expect(deliverNotification).not.toHaveBeenCalled();
    });

    test("does not query or send non-production jobs without an approved test recipient", async () => {
        delete process.env.NOTIFICATION_TEST_RECIPIENTS;

        await expect(processNotificationBatch()).resolves.toBe(0);

        expect(Notification.findAll).not.toHaveBeenCalled();
        expect(deliverNotification).not.toHaveBeenCalled();
    });

    test("leaves an unapproved destination pending without consuming an attempt", async () => {
        notification.recipient_address = "unapproved@example.test";

        await expect(processNotificationBatch()).resolves.toBe(0);

        expect(notification.update).not.toHaveBeenCalled();
        expect(deliverNotification).not.toHaveBeenCalled();
    });

    test("keeps production delivery behind its existing switch without a test allowlist", async () => {
        process.env.NODE_ENV = "production";
        delete process.env.NOTIFICATION_TEST_RECIPIENTS;

        await expect(processNotificationBatch()).resolves.toBe(1);

        expect(deliverNotification).toHaveBeenCalledTimes(1);
        expect(Notification.findAll.mock.calls[0][0].where[Op.and]).toBeUndefined();
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

    test("marks an ambiguous provider response without scheduling another send", async () => {
        deliverNotification.mockRejectedValue(
            Object.assign(new Error("Provider response timed out"), {
                deliveryOutcome: "unknown",
                retryable: false,
            }),
        );

        await processNotificationBatch();

        expect(notification.update).toHaveBeenLastCalledWith({
            status: "OutcomeUnknown",
            last_error:
                "El proveedor no confirmó el resultado del envío. Verifica el estado antes de reintentar.",
        });
        expect(notification.update).not.toHaveBeenCalledWith(
            expect.objectContaining({ status: "Pending" }),
        );
    });

    test("does not resend when the provider accepted but saving Sent failed", async () => {
        notification.update
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error("Database write failed"));

        await processNotificationBatch();

        expect(deliverNotification).toHaveBeenCalledTimes(1);
        expect(Notification.update).toHaveBeenCalledWith(
            {
                status: "OutcomeUnknown",
                last_error:
                    "El proveedor no confirmó el resultado del envío. Verifica el estado antes de reintentar.",
            },
            { where: { id: notification.id, status: "Processing" } },
        );
    });

    test("marks processing records older than ten minutes uncertain without redelivering them", async () => {
        Notification.findAll.mockResolvedValue([]);

        await processNotificationBatch();

        const [recoveryValues, recoveryOptions] = Notification.update.mock.calls.find(
            ([values]) => values.status === "OutcomeUnknown",
        );
        expect(recoveryValues).toEqual({
            status: "OutcomeUnknown",
            last_error:
                "El proveedor no confirmó el resultado del envío. Verifica el estado antes de reintentar.",
        });
        expect(recoveryOptions).toEqual(
            expect.objectContaining({
                where: {
                    status: "Processing",
                    updated_at: { [Op.lt]: new Date("2026-11-01T14:50:00.000Z") },
                },
                transaction,
            }),
        );
        expect(Notification.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    status: "Pending",
                    scheduled_at: expect.any(Object),
                    [Op.and]: where(fn("LOWER", fn("TRIM", col("recipient_address"))), {
                        [Op.in]: ["notification-test@example.test"],
                    }),
                },
                transaction,
                lock: transaction.LOCK.UPDATE,
                skipLocked: true,
            }),
        );
        expect(deliverNotification).not.toHaveBeenCalled();
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
