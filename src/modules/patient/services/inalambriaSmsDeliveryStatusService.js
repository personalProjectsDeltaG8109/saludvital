import database from "../../../../config/database.js";
import { Notification } from "../../../models/associations.js";

const FINAL_PROVIDER_STATUSES = {
    DELIVERED_TO_HANDSET: "delivered",
    NO_SUCCESS: "failed",
};

export class InvalidInalambriaSmsCallbackError extends Error {
    constructor() {
        super("Invalid Inalambria SMS status callback.");
        this.name = "InvalidInalambriaSmsCallbackError";
    }
}

function parseCallbackResult(payload) {
    const result = payload?.results?.[0];
    if (!result || payload.results.length !== 1) throw new InvalidInalambriaSmsCallbackError();

    const transactionNumber = String(result.transactionNumber || "");
    const recipient = normalizeRecipient(result.to);
    const providerStatus = String(result.status?.name || "").toUpperCase();

    if (!/^\d{28}$/.test(transactionNumber) || !recipient) {
        throw new InvalidInalambriaSmsCallbackError();
    }

    return {
        transactionNumber,
        recipient,
        customMessageId: parseCustomMessageId(result),
        finalStatus: FINAL_PROVIDER_STATUSES[providerStatus] || null,
    };
}

function normalizeRecipient(value) {
    const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
    return /^57\d{10}$/.test(digits) ? digits : null;
}

function parseCustomMessageId(result) {
    const candidates = [
        result.customMessageId,
        result.CustomMessageId,
        result.callbackData,
        result.CallbackData,
        result.messageId,
    ];

    for (const candidate of candidates) {
        const value = String(candidate || "");
        if (/^[1-9]\d{0,9}$/.test(value)) return Number(value);
    }
    return null;
}

function recipientMatches(notification, callbackRecipient) {
    return normalizeRecipient(notification.recipient_address) === callbackRecipient;
}

async function findNotification(callback, transaction) {
    const byProviderReference = await Notification.findOne({
        where: {
            channel: "SMS",
            provider_message_id: callback.transactionNumber,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
    });

    if (byProviderReference) return byProviderReference;
    if (!callback.customMessageId) return null;

    return Notification.findOne({
        where: { id: callback.customMessageId, channel: "SMS" },
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
}

function callbackMatchesNotification(notification, callback) {
    if (!notification || !recipientMatches(notification, callback.recipient)) return false;
    return (
        !notification.provider_message_id ||
        notification.provider_message_id === callback.transactionNumber
    );
}

function shouldApplyFinalStatus(currentStatus) {
    return !currentStatus || currentStatus === "sent";
}

export async function processInalambriaSmsDeliveryStatus(payload) {
    const callback = parseCallbackResult(payload);
    if (!callback.finalStatus) return { status: "ignored" };

    return database.transaction(async (transaction) => {
        const notification = await findNotification(callback, transaction);
        if (!callbackMatchesNotification(notification, callback)) return { status: "not_found" };

        const currentStatus = notification.provider_delivery_status;
        if (!shouldApplyFinalStatus(currentStatus)) {
            return { status: "unchanged" };
        }

        // The callback contract has no event timestamp, so persist receipt time without inventing one.
        await notification.update(
            {
                provider_delivery_status: callback.finalStatus,
                provider_delivery_status_at: new Date(),
                last_error:
                    callback.finalStatus === "failed"
                        ? "Inalambria informó que no fue posible entregar el SMS."
                        : null,
            },
            { transaction },
        );

        return { status: "updated" };
    });
}
