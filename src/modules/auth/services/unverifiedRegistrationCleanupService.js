import { Op } from "sequelize";
import database from "../../../../config/database.js";
import {
    Appointment,
    AppointmentHistory,
    AuditLog,
    ChatbotFlowVersion,
    Doctor,
    DoctorScheduleException,
    EmailOutbox,
    EmergencyContact,
    Notification,
    NotificationPreference,
    PasswordResetToken,
    Patient,
    Rol,
    User,
    WhatsAppAppointmentRequest,
    WhatsAppConversation,
    WhatsAppVerification,
} from "../../../models/associations.js";

const DEFAULT_BATCH_SIZE = 50;

const patientDependencyModels = [
    Appointment,
    Notification,
    NotificationPreference,
    WhatsAppAppointmentRequest,
    WhatsAppConversation,
    WhatsAppVerification,
    EmergencyContact,
];

function getUserDependencies(userId) {
    return [
        [AppointmentHistory, { actor_user_id: userId }],
        [ChatbotFlowVersion, { created_by: userId }],
        [Doctor, { user_id: userId }],
        [DoctorScheduleException, { created_by: userId }],
        [PasswordResetToken, { user_id: userId }],
    ];
}

function getExpiredBefore(now, retentionMinutes) {
    return new Date(now.getTime() - retentionMinutes * 60 * 1000);
}

async function hasRelatedRecords(models, where, transaction) {
    for (const model of models) {
        const count = await model.count({ where, transaction });
        if (count > 0) return true;
    }

    return false;
}

async function hasAuditReferences(userId, patientId, transaction) {
    const targetIds = [String(userId)];
    if (patientId) targetIds.push(String(patientId));

    return (
        (await AuditLog.count({
            where: {
                [Op.or]: [
                    { actor_user_id: userId },
                    {
                        target_type: { [Op.in]: ["User", "Patient"] },
                        target_id: { [Op.in]: targetIds },
                    },
                ],
            },
            transaction,
        })) > 0
    );
}

async function hasProtectedRecords(userId, patientId, transaction) {
    for (const [model, where] of getUserDependencies(userId)) {
        if ((await model.count({ where, transaction })) > 0) return true;
    }

    if (await hasAuditReferences(userId, patientId, transaction)) {
        return true;
    }

    return (
        patientId &&
        (await hasRelatedRecords(patientDependencyModels, { patient_id: patientId }, transaction))
    );
}

async function deleteExpiredRegistration(userId, expiredBefore) {
    return database.transaction(async (transaction) => {
        const user = await User.findByPk(userId, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (!user || user.email_verified_at || new Date(user.created_at) > expiredBefore) {
            return false;
        }

        const role = await Rol.findByPk(user.role_id, {
            attributes: ["name"],
            transaction,
        });

        if (role?.name !== "Patient") return false;

        const patient = await Patient.findOne({
            where: { user_id: user.id },
            attributes: ["id"],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        const patientId = patient?.id ?? null;

        const emailJobs = await EmailOutbox.findAll({
            where: { user_id: user.id },
            attributes: ["id", "event_type", "status"],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (
            emailJobs.some(
                (job) => job.status === "processing" || job.event_type !== "email_verification",
            )
        ) {
            return false;
        }

        if (await hasProtectedRecords(user.id, patientId, transaction)) return false;

        if (emailJobs.length) {
            await EmailOutbox.destroy({
                where: { user_id: user.id, event_type: "email_verification" },
                transaction,
            });
        }

        if (patient) await patient.destroy({ transaction });
        await user.destroy({ transaction });

        return true;
    });
}

/** Remove only expired, unverified patient registrations without business history. */
export async function cleanExpiredUnverifiedRegistrations({
    now = new Date(),
    retentionMinutes = 30,
    batchSize = DEFAULT_BATCH_SIZE,
    afterUserId = 0,
} = {}) {
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
        throw new TypeError("The cleanup reference time must be a valid date.");
    }
    if (!Number.isInteger(retentionMinutes) || retentionMinutes < 30) {
        throw new TypeError("The retention period must be an integer of at least 30 minutes.");
    }
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
        throw new TypeError("The cleanup batch size must be an integer between 1 and 100.");
    }
    if (!Number.isInteger(afterUserId) || afterUserId < 0) {
        throw new TypeError("The cleanup cursor must be a non-negative integer.");
    }

    const expiredBefore = getExpiredBefore(now, retentionMinutes);
    const candidates = await User.findAll({
        where: {
            id: { [Op.gt]: afterUserId },
            email_verified_at: null,
            created_at: { [Op.lte]: expiredBefore },
        },
        attributes: ["id"],
        order: [["id", "ASC"]],
        limit: batchSize,
    });

    let deletedCount = 0;
    for (const candidate of candidates) {
        if (await deleteExpiredRegistration(candidate.id, expiredBefore)) deletedCount += 1;
    }

    return {
        deletedCount,
        examinedCount: candidates.length,
        nextAfterUserId: candidates.length === batchSize ? candidates[candidates.length - 1].id : 0,
    };
}
