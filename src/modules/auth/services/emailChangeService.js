import { Op } from "sequelize";
import { EmailOutbox, User } from "../../../models/associations.js";

export async function isEmailUnavailable(email, userId, transaction) {
    // Keep this lookup non-locking; unique constraints resolve concurrent registrations.
    const where = {
        [Op.or]: [{ email }, { pending_email: email }],
    };
    if (userId !== null && userId !== undefined) {
        where.id = { [Op.ne]: userId };
    }

    const queryOptions = {
        where,
        attributes: ["id"],
        transaction,
    };

    const existingUser = await User.findOne(queryOptions);

    return Boolean(existingUser);
}

export function getEmailChangeAttributes(user, email, requestedAt = new Date()) {
    const verificationFields = {
        email_verification_token_hash: null,
        email_verification_expires_at: null,
    };

    if (user.email_verified_at) {
        return {
            ...verificationFields,
            pending_email: email,
            email_verification_requested_at: requestedAt,
        };
    }

    return {
        ...verificationFields,
        email,
        email_verified_at: null,
        pending_email: null,
        email_verification_requested_at: null,
    };
}

export function isEmailUniqueConstraintError(error) {
    return Boolean(
        error?.name === "SequelizeUniqueConstraintError" &&
        (error.fields?.email ||
            error.fields?.pending_email ||
            error.errors?.some((item) => ["email", "pending_email"].includes(item.path))),
    );
}

export async function requestEmailChange(user, email, transaction, requestedAt = new Date()) {
    const processingJobOptions = {
        where: {
            user_id: user.id,
            event_type: "email_verification",
            status: "processing",
        },
        attributes: ["id"],
        transaction,
    };
    if (transaction?.LOCK?.UPDATE) processingJobOptions.lock = transaction.LOCK.UPDATE;

    const processingJob = await EmailOutbox.findOne(processingJobOptions);

    if (processingJob) {
        const error = new Error(
            "Hay un correo de verificación en envío. Espera un momento e intenta cambiar la dirección nuevamente.",
        );
        error.status = 409;
        error.statusCode = 409;
        throw error;
    }

    await EmailOutbox.update(
        { status: "failed", locked_at: null, next_attempt_at: requestedAt },
        {
            where: {
                user_id: user.id,
                event_type: "email_verification",
                status: "pending",
            },
            transaction,
        },
    );

    await user.update(getEmailChangeAttributes(user, email, requestedAt), { transaction });
    await EmailOutbox.create(
        {
            user_id: user.id,
            event_type: "email_verification",
            status: "pending",
            attempts: 0,
            next_attempt_at: requestedAt,
        },
        { transaction },
    );
}
