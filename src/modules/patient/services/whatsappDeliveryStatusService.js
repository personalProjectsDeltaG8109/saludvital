import database from "../../../../config/database.js";
import { Notification } from "../../../models/associations.js";
import WhatsAppMessage from "../../../models/WhatsAppMessage.js";

const META_PROVIDER = "Meta WhatsApp Cloud API";
const supportedStatuses = new Set(["sent", "delivered", "read", "failed"]);
const successfulStatusRank = new Map([
    ["sent", 1],
    ["delivered", 2],
    ["read", 3],
]);

export function parseMetaDeliveryTimestamp(timestamp) {
    // Meta webhook timestamps are Unix seconds; reject missing values instead of guessing an order.
    if (typeof timestamp !== "string" || !/^\d{1,13}$/.test(timestamp)) return null;

    const timestampMilliseconds = Number(timestamp) * 1000;
    if (!Number.isSafeInteger(timestampMilliseconds)) return null;

    const parsedTimestamp = new Date(timestampMilliseconds);
    return Number.isNaN(parsedTimestamp.getTime()) ? null : parsedTimestamp;
}

export function shouldApplyMetaDeliveryStatus(
    currentStatus,
    currentTimestamp,
    nextStatus,
    nextTimestamp,
) {
    if (!supportedStatuses.has(nextStatus)) return false;
    if (!currentStatus) return true;
    if (!supportedStatuses.has(currentStatus)) return false;

    const currentTime = currentTimestamp ? new Date(currentTimestamp).getTime() : null;
    const nextTime = new Date(nextTimestamp).getTime();
    if (Number.isNaN(nextTime) || Number.isNaN(currentTime)) return false;
    if (currentTime !== null && nextTime < currentTime) return false;
    if (currentStatus === nextStatus) return currentTime === null || nextTime > currentTime;

    // Read and failed are terminal for one provider message ID.
    if (currentStatus === "read" || currentStatus === "failed") return false;
    if (nextStatus === "sent") return false;
    if (nextStatus === "failed") return currentStatus === "sent";

    return successfulStatusRank.get(nextStatus) > successfulStatusRank.get(currentStatus);
}

function providerFailureDescription(status) {
    const providerErrorCode = Number(status.errors?.[0]?.code);
    if (Number.isSafeInteger(providerErrorCode) && providerErrorCode >= 0) {
        return `Meta WhatsApp delivery failed with provider code ${providerErrorCode}.`;
    }
    return "Meta WhatsApp reported a delivery failure.";
}

async function updateMessageStatus(status, timestamp, transaction) {
    const message = await WhatsAppMessage.findOne({
        attributes: ["id", "delivery_status", "delivery_status_at"],
        where: {
            provider_name: META_PROVIDER,
            provider_account_id: status.accountId,
            provider_message_id: status.id,
            direction: "Outbound",
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
    });

    if (
        !message ||
        !shouldApplyMetaDeliveryStatus(
            message.delivery_status,
            message.delivery_status_at,
            status.status,
            timestamp,
        )
    ) {
        return;
    }

    await message.update(
        { delivery_status: status.status, delivery_status_at: timestamp },
        { transaction },
    );
}

async function updateNotificationStatus(status, timestamp, transaction) {
    const notification = await Notification.findOne({
        attributes: ["id", "provider_delivery_status", "provider_delivery_status_at"],
        where: { channel: "WhatsApp", provider_message_id: status.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
    });

    if (
        !notification ||
        !shouldApplyMetaDeliveryStatus(
            notification.provider_delivery_status,
            notification.provider_delivery_status_at,
            status.status,
            timestamp,
        )
    ) {
        return;
    }

    await notification.update(
        {
            provider_delivery_status: status.status,
            provider_delivery_status_at: timestamp,
            ...(status.status === "failed"
                ? { last_error: providerFailureDescription(status) }
                : {}),
        },
        { transaction },
    );
}

export async function processMetaDeliveryStatus(status, accountId) {
    if (
        !status ||
        typeof status.id !== "string" ||
        !status.id.trim() ||
        !supportedStatuses.has(status.status)
    ) {
        return;
    }

    const timestamp = parseMetaDeliveryTimestamp(status.timestamp);
    if (!timestamp || typeof accountId !== "string" || !accountId) return;

    const scopedStatus = { ...status, accountId };
    const transaction = await database.transaction();
    try {
        await updateMessageStatus(scopedStatus, timestamp, transaction);
        await updateNotificationStatus(scopedStatus, timestamp, transaction);
        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}
