import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const transaction = { LOCK: { UPDATE: "UPDATE" } };
const database = { transaction: jest.fn() };
const Notification = { findOne: jest.fn() };

jest.unstable_mockModule("../../config/database.js", () => ({ default: database }));
jest.unstable_mockModule("../../src/models/associations.js", () => ({ Notification }));

const { InvalidInalambriaSmsCallbackError, processInalambriaSmsDeliveryStatus } =
    await import("../../src/modules/patient/services/inalambriaSmsDeliveryStatusService.js");

function makeCallback(statusName, overrides = {}) {
    return {
        results: [
            {
                transactionNumber: "1234567890123456789012345678",
                to: "573137498332",
                messageId: "41",
                status: { name: statusName },
                ...overrides,
            },
        ],
    };
}

describe("Inalambria SMS delivery status callbacks", () => {
    let notification;

    beforeEach(() => {
        jest.clearAllMocks();
        database.transaction.mockImplementation(async (callback) => callback(transaction));
        notification = {
            id: 41,
            channel: "SMS",
            recipient_address: "+573137498332",
            provider_message_id: null,
            provider_delivery_status: null,
            update: jest.fn(async (changes) => Object.assign(notification, changes)),
        };
    });

    test("stores confirmed handset delivery using the notification reference", async () => {
        Notification.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(notification);

        await expect(
            processInalambriaSmsDeliveryStatus(makeCallback("DELIVERED_TO_HANDSET")),
        ).resolves.toEqual({ status: "updated" });

        expect(Notification.findOne).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                where: {
                    channel: "SMS",
                    provider_message_id: "1234567890123456789012345678",
                },
                lock: "UPDATE",
                transaction,
            }),
        );
        expect(Notification.findOne).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                where: { id: 41, channel: "SMS" },
                lock: "UPDATE",
                transaction,
            }),
        );
        expect(notification.update).toHaveBeenCalledWith(
            expect.objectContaining({
                provider_delivery_status: "delivered",
                provider_delivery_status_at: expect.any(Date),
                last_error: null,
            }),
            { transaction },
        );
    });

    test("stores a safe failure description without provider supplied text", async () => {
        Notification.findOne.mockResolvedValueOnce(notification);

        await processInalambriaSmsDeliveryStatus(
            makeCallback("NO_SUCCESS", { detail: "private phone or provider text" }),
        );

        expect(notification.update).toHaveBeenCalledWith(
            expect.objectContaining({
                provider_delivery_status: "failed",
                last_error: "Inalambria informó que no fue posible entregar el SMS.",
            }),
            { transaction },
        );
        expect(JSON.stringify(notification.update.mock.calls)).not.toContain(
            "private phone or provider text",
        );
    });

    test("matches provider transaction and recipient when no custom reference is returned", async () => {
        notification.provider_message_id = "1234567890123456789012345678";
        Notification.findOne.mockResolvedValueOnce(notification);

        await expect(
            processInalambriaSmsDeliveryStatus(
                makeCallback("DELIVERED_TO_HANDSET", { messageId: "provider-message-id" }),
            ),
        ).resolves.toEqual({ status: "updated" });

        expect(Notification.findOne).toHaveBeenCalledTimes(1);
    });

    test("does not replace an existing final delivery result with a late callback", async () => {
        notification.provider_delivery_status = "delivered";
        Notification.findOne.mockResolvedValueOnce(notification);

        await expect(
            processInalambriaSmsDeliveryStatus(makeCallback("NO_SUCCESS")),
        ).resolves.toEqual({ status: "unchanged" });

        expect(notification.update).not.toHaveBeenCalled();
    });

    test("returns not found when the transaction or recipient does not match", async () => {
        Notification.findOne.mockResolvedValueOnce(notification);

        await expect(
            processInalambriaSmsDeliveryStatus(
                makeCallback("DELIVERED_TO_HANDSET", { to: "573000000000" }),
            ),
        ).resolves.toEqual({ status: "not_found" });

        expect(notification.update).not.toHaveBeenCalled();
    });

    test("ignores states that Inalambria does not define as final delivery results", async () => {
        await expect(processInalambriaSmsDeliveryStatus(makeCallback("ACCEPTED"))).resolves.toEqual(
            { status: "ignored" },
        );

        expect(database.transaction).not.toHaveBeenCalled();
    });

    test("rejects malformed callback payloads before querying notifications", async () => {
        await expect(processInalambriaSmsDeliveryStatus({ results: [] })).rejects.toBeInstanceOf(
            InvalidInalambriaSmsCallbackError,
        );

        expect(database.transaction).not.toHaveBeenCalled();
        expect(Notification.findOne).not.toHaveBeenCalled();
    });
});
