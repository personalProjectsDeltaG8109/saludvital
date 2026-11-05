import { Op } from "sequelize";
import database from "../../../../config/database.js";
import {
    Appointment,
    AppointmentStatus,
    AppointmentHistory,
} from "../../../models/associations.js";
import AuditLog from "../../../models/AuditLog.js";

const CONFIRMED_STATUS = "Confirmed";
const NO_SHOW_STATUS = "No Show";
const GRACE_PERIOD_MS = 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 50;

function validateBatchSize(batchSize) {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
        throw new TypeError("The no-show batch size must be between 1 and 500.");
    }
}

function validateReferenceTime(referenceTime) {
    const parsedTime = new Date(referenceTime);
    if (Number.isNaN(parsedTime.getTime())) {
        throw new TypeError("The no-show reference time must be a valid date.");
    }
    return parsedTime;
}

async function getStatusIds(transaction) {
    const statuses = await AppointmentStatus.findAll({
        where: { name: { [Op.in]: [CONFIRMED_STATUS, NO_SHOW_STATUS] } },
        attributes: ["id", "name"],
        transaction,
    });
    const ids = new Map(statuses.map((status) => [status.name, status.id]));
    const confirmedStatusId = ids.get(CONFIRMED_STATUS);
    const noShowStatusId = ids.get(NO_SHOW_STATUS);

    if (!confirmedStatusId) return null;
    if (!noShowStatusId) {
        throw new Error("Appointment statuses required for no-show processing are missing.");
    }

    return { confirmedStatusId, noShowStatusId };
}

async function recordNoShowTransition(appointment, noShowStatusId, occurredAt, transaction) {
    const [updatedCount] = await Appointment.update(
        { status_id: noShowStatusId },
        { where: { id: appointment.id, status_id: appointment.status_id }, transaction },
    );
    if (updatedCount !== 1) return false;

    await AppointmentHistory.create(
        {
            appointment_id: appointment.id,
            actor_user_id: null,
            actor_snapshot: "System appointment scheduler",
            event_type: "NoShowMarked",
            previous_values: { status: CONFIRMED_STATUS },
            new_values: { status: NO_SHOW_STATUS },
            reason: "The appointment remained confirmed one hour after its scheduled start.",
            occurred_at: occurredAt,
        },
        { transaction },
    );
    await AuditLog.create(
        {
            actor_user_id: null,
            actor_snapshot: "System appointment scheduler",
            action: "AppointmentMarkedNoShow",
            target_type: "Appointment",
            target_id: String(appointment.id),
            changes: { previous: { status: CONFIRMED_STATUS }, next: { status: NO_SHOW_STATUS } },
            reason: "The appointment remained confirmed one hour after its scheduled start.",
            result: "Success",
            occurred_at: occurredAt,
        },
        { transaction },
    );
    return true;
}

/** Compare persisted appointment instants against the one-hour grace-period cutoff. */
export async function markMissedAppointments({
    referenceTime = new Date(),
    batchSize = DEFAULT_BATCH_SIZE,
} = {}) {
    validateBatchSize(batchSize);
    const occurredAt = validateReferenceTime(referenceTime);
    const cutoff = new Date(occurredAt.getTime() - GRACE_PERIOD_MS);

    return database.transaction(async (transaction) => {
        const statusIds = await getStatusIds(transaction);
        if (!statusIds) return 0;

        const { confirmedStatusId, noShowStatusId } = statusIds;
        const appointments = await Appointment.findAll({
            attributes: ["id", "status_id", "start_at"],
            where: {
                status_id: confirmedStatusId,
                start_at: { [Op.lte]: cutoff },
            },
            order: [
                ["start_at", "ASC"],
                ["id", "ASC"],
            ],
            limit: batchSize,
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        let updatedCount = 0;
        for (const appointment of appointments) {
            const updated = await recordNoShowTransition(
                appointment,
                noShowStatusId,
                occurredAt,
                transaction,
            );
            if (updated) updatedCount += 1;
        }

        return updatedCount;
    });
}
