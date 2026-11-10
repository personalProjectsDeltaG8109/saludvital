import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const transaction = {
    LOCK: { UPDATE: "UPDATE" },
    commit: jest.fn(),
    rollback: jest.fn(),
};
const database = { transaction: jest.fn() };
const WhatsAppMessage = { findOne: jest.fn() };
const Notification = { findOne: jest.fn() };

jest.unstable_mockModule("../../config/database.js", () => ({ default: database }));
jest.unstable_mockModule("../../src/models/WhatsAppMessage.js", () => ({
    default: WhatsAppMessage,
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({ Notification }));

const { parseMetaDeliveryTimestamp, processMetaDeliveryStatus, shouldApplyMetaDeliveryStatus } =
    await import("../../src/modules/patient/services/whatsappDeliveryStatusService.js");

describe("WhatsApp delivery status ordering", () => {
    let messageRecord;
    let notificationRecord;

    beforeEach(() => {
        jest.clearAllMocks();
        transaction.commit.mockResolvedValue(undefined);
        transaction.rollback.mockResolvedValue(undefined);
        database.transaction.mockResolvedValue(transaction);

        messageRecord = {
            delivery_status: null,
            delivery_status_at: null,
            update: jest.fn(async (changes) => Object.assign(messageRecord, changes)),
        };
        notificationRecord = {
            provider_delivery_status: null,
            provider_delivery_status_at: null,
            update: jest.fn(async (changes) => Object.assign(notificationRecord, changes)),
        };
        WhatsAppMessage.findOne.mockResolvedValue(messageRecord);
        Notification.findOne.mockResolvedValue(notificationRecord);
    });

    test("parses Meta Unix-second timestamps and rejects invalid values", () => {
        expect(parseMetaDeliveryTimestamp("1793235025").toISOString()).toBe(
            "2026-10-29T00:50:25.000Z",
        );
        expect(parseMetaDeliveryTimestamp("not-a-timestamp")).toBeNull();
        expect(parseMetaDeliveryTimestamp(undefined)).toBeNull();
    });

    test("accepts forward transitions and rejects stale or regressive callbacks", () => {
        const earlier = new Date("2026-11-10T12:00:00.000Z");
        const later = new Date("2026-11-10T12:01:00.000Z");

        expect(shouldApplyMetaDeliveryStatus(null, null, "read", earlier)).toBe(true);
        expect(shouldApplyMetaDeliveryStatus("sent", earlier, "delivered", earlier)).toBe(true);
        expect(shouldApplyMetaDeliveryStatus("delivered", earlier, "read", later)).toBe(true);
        expect(shouldApplyMetaDeliveryStatus("read", later, "sent", later)).toBe(false);
        expect(shouldApplyMetaDeliveryStatus("delivered", later, "sent", earlier)).toBe(false);
        expect(shouldApplyMetaDeliveryStatus("failed", earlier, "delivered", later)).toBe(false);
        expect(shouldApplyMetaDeliveryStatus("sent", earlier, "unknown", later)).toBe(false);
    });

    test("updates both persisted records in the same transaction as states advance", async () => {
        await processMetaDeliveryStatus(
            { id: "wamid.123", status: "sent", timestamp: "1793235025" },
            "phone-1",
        );
        await processMetaDeliveryStatus(
            { id: "wamid.123", status: "delivered", timestamp: "1793235085" },
            "phone-1",
        );
        await processMetaDeliveryStatus(
            { id: "wamid.123", status: "read", timestamp: "1793235145" },
            "phone-1",
        );

        expect(messageRecord.delivery_status).toBe("read");
        expect(messageRecord.delivery_status_at.toISOString()).toBe("2026-10-29T00:52:25.000Z");
        expect(notificationRecord.provider_delivery_status).toBe("read");
        expect(notificationRecord.provider_delivery_status_at.toISOString()).toBe(
            "2026-10-29T00:52:25.000Z",
        );
        expect(messageRecord.update).toHaveBeenCalledWith(
            expect.objectContaining({ delivery_status: "read" }),
            { transaction },
        );
        expect(notificationRecord.update).toHaveBeenCalledWith(
            expect.objectContaining({ provider_delivery_status: "read" }),
            { transaction },
        );
        expect(WhatsAppMessage.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    provider_name: "Meta WhatsApp Cloud API",
                    provider_account_id: "phone-1",
                    provider_message_id: "wamid.123",
                    direction: "Outbound",
                }),
                lock: "UPDATE",
            }),
        );
        expect(transaction.commit).toHaveBeenCalledTimes(3);
    });

    test("does not let an older sent callback replace a read state", async () => {
        messageRecord.delivery_status = "read";
        messageRecord.delivery_status_at = new Date("2026-11-10T12:05:00.000Z");
        notificationRecord.provider_delivery_status = "read";
        notificationRecord.provider_delivery_status_at = new Date("2026-11-10T12:05:00.000Z");

        await processMetaDeliveryStatus(
            { id: "wamid.123", status: "sent", timestamp: "1793235025" },
            "phone-1",
        );

        expect(messageRecord.update).not.toHaveBeenCalled();
        expect(notificationRecord.update).not.toHaveBeenCalled();
        expect(messageRecord.delivery_status).toBe("read");
        expect(notificationRecord.provider_delivery_status).toBe("read");
    });

    test("does not apply the same callback twice", async () => {
        const callback = { id: "wamid.123", status: "delivered", timestamp: "1793235085" };

        await processMetaDeliveryStatus(callback, "phone-1");
        await processMetaDeliveryStatus(callback, "phone-1");

        expect(messageRecord.update).toHaveBeenCalledTimes(1);
        expect(notificationRecord.update).toHaveBeenCalledTimes(1);
        expect(transaction.commit).toHaveBeenCalledTimes(2);
    });

    test("stores only a safe provider code for failure and keeps the failure terminal", async () => {
        await processMetaDeliveryStatus(
            {
                id: "wamid.123",
                status: "sent",
                timestamp: "1793235025",
            },
            "phone-1",
        );
        await processMetaDeliveryStatus(
            {
                id: "wamid.123",
                status: "failed",
                timestamp: "1793235085",
                errors: [{ code: 131047, title: "Sensitive provider detail" }],
            },
            "phone-1",
        );

        expect(notificationRecord.provider_delivery_status).toBe("failed");
        expect(notificationRecord.last_error).toBe(
            "Meta WhatsApp delivery failed with provider code 131047.",
        );
        await processMetaDeliveryStatus(
            { id: "wamid.123", status: "delivered", timestamp: "1793235145" },
            "phone-1",
        );

        expect(messageRecord.delivery_status).toBe("failed");
        expect(notificationRecord.provider_delivery_status).toBe("failed");
        expect(notificationRecord.last_error).not.toContain("Sensitive provider detail");
    });

    test("ignores malformed callbacks without opening a transaction", async () => {
        await processMetaDeliveryStatus(
            { id: "wamid.123", status: "queued", timestamp: "1" },
            "phone-1",
        );
        await processMetaDeliveryStatus(
            { id: "wamid.123", status: "sent", timestamp: "invalid" },
            "phone-1",
        );

        expect(database.transaction).not.toHaveBeenCalled();
        expect(WhatsAppMessage.findOne).not.toHaveBeenCalled();
        expect(Notification.findOne).not.toHaveBeenCalled();
    });

    test("rolls back both status updates if either database write fails", async () => {
        notificationRecord.update.mockRejectedValue(new Error("database failure"));

        await expect(
            processMetaDeliveryStatus(
                { id: "wamid.123", status: "sent", timestamp: "1793235025" },
                "phone-1",
            ),
        ).rejects.toThrow("database failure");

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(transaction.commit).not.toHaveBeenCalled();
    });
});
