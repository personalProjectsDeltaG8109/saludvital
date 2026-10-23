import { Op } from "sequelize";
import database from "../../../../config/database.js";
import { Appointment, AppointmentStatus, Notification } from "../../../models/associations.js";
import { deliverNotification } from "./notificationDeliveryService.js";

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
const STALE_PROCESSING_MS = 10 * 60_000;

function isRetryable(error) {
    if (typeof error?.retryable === "boolean") return error.retryable;
    const status = Number(error?.status || error?.statusCode);
    if (Number.isFinite(status) && status > 0) {
        return status === 408 || status === 429 || status >= 500;
    }
    const message = error instanceof Error ? error.message : "";
    if (
        /not configured|invalid|unsupported|required|must use|must contain|template/i.test(message)
    ) {
        return false;
    }
    return true;
}

function deliveryEnabled() {
    return process.env.NOTIFICATION_DELIVERY_ENABLED === "true";
}

async function claimBatch(batchSize) {
    return database.transaction(async (transaction) => {
        const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
        await Notification.update(
            { status: "Pending", last_error: "Recovered after an interrupted delivery attempt." },
            {
                where: {
                    status: "Processing",
                    updated_at: { [Op.lt]: staleBefore },
                },
                transaction,
            },
        );

        const notifications = await Notification.findAll({
            where: { status: "Pending", scheduled_at: { [Op.lte]: new Date() } },
            order: [
                ["scheduled_at", "ASC"],
                ["id", "ASC"],
            ],
            limit: batchSize,
            transaction,
            lock: transaction.LOCK.UPDATE,
            skipLocked: true,
        });
        for (const notification of notifications) {
            await notification.update(
                { status: "Processing", attempt_count: notification.attempt_count + 1 },
                { transaction },
            );
        }
        return notifications;
    });
}

async function isCurrentAppointmentNotification(notification) {
    if (notification.event_type !== "appointment_reminder") return true;
    const appointment = await Appointment.findByPk(notification.appointment_id, {
        include: [{ model: AppointmentStatus, as: "status", required: true }],
    });
    if (!appointment || appointment.status.name !== "Confirmed") return false;
    const scheduledAppointmentTime = new Date(
        notification.payload?.appointmentStart || NaN,
    ).getTime();
    return scheduledAppointmentTime === new Date(appointment.start_at).getTime();
}

async function processOne(notification) {
    try {
        if (!(await isCurrentAppointmentNotification(notification))) {
            await notification.update({
                status: "Cancelled",
                last_error: "Appointment changed before reminder delivery.",
            });
            return;
        }
        const result = await deliverNotification(notification);
        await notification.update({
            status: "Sent",
            sent_at: new Date(),
            provider_message_id: result?.id || null,
            last_error: null,
        });
    } catch (error) {
        const attempts = Number(notification.attempt_count);
        const retryDelay = RETRY_DELAYS_MS[attempts - 1];
        const retry = isRetryable(error) && attempts < MAX_ATTEMPTS && retryDelay !== undefined;
        const errorMessage = error instanceof Error ? error.message : "Unknown delivery error.";
        await notification.update({
            status: retry ? "Pending" : "Failed",
            scheduled_at: retry ? new Date(Date.now() + retryDelay) : notification.scheduled_at,
            last_error: errorMessage.slice(0, 2000),
        });
    }
}

export async function processNotificationBatch(batchSize = 10) {
    if (!deliveryEnabled()) return 0;
    const notifications = await claimBatch(batchSize);
    for (const notification of notifications) await processOne(notification);
    return notifications.length;
}
