import bcrypt from "bcrypt";
import { createHash } from "node:crypto";
import { Op } from "sequelize";
import database from "../../../../config/database.js";
import AuditLog from "../../../models/AuditLog.js";
import { EmailOutbox, PasswordResetToken, Rol, User } from "../../../models/associations.js";
import { endUserSessions } from "./sessionActivity.js";
import { isValidPassword } from "./passwordPolicy.js";

// Keep password recovery tokens valid for 30 minutes.

// Validate the password using the same policy as patient registration.
function validatePassword(password, confirmation) {
    if (typeof confirmation !== "string" || !isValidPassword(password)) {
        return false;
    }

    return password === confirmation;
}

// Hash reset tokens before storing or searching for them.
function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

// Queue a recovery email without revealing whether an account exists.
export async function requestPasswordReset(email) {
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    // Invalid input receives the same public result as an unknown account.
    if (
        !normalizedEmail ||
        normalizedEmail.length > 320 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
        return { requested: true };
    }

    await database.transaction(async (transaction) => {
        const user = await User.findOne({
            where: {
                email: normalizedEmail,
                is_active: true,
            },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        // Only verified accounts can request password recovery.
        if (!user || !user.email_verified_at) {
            return;
        }

        // Keep email delivery asynchronous through the existing outbox.
        await EmailOutbox.create(
            {
                user_id: user.id,
                event_type: "password_reset",
                status: "pending",
                attempts: 0,
                next_attempt_at: new Date(),
            },
            { transaction },
        );
    });

    return { requested: true };
}

// Validate the token and update the password atomically.
export async function resetPassword(token, password, confirmation) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
        return { reset: false, reason: "invalid_or_expired" };
    }

    if (!validatePassword(password, confirmation)) {
        return { reset: false, reason: "invalid_password" };
    }

    const tokenHash = hashToken(token);
    const now = new Date();

    // Commit the password update before revoking active sessions.
    const result = await database.transaction(async (transaction) => {
        // Lock the token row to prevent concurrent reuse.
        const resetToken = await PasswordResetToken.findOne({
            where: {
                token_hash: tokenHash,
                used_at: null,
                expires_at: { [Op.gt]: now },
            },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (!resetToken) {
            return { reset: false, reason: "invalid_or_expired" };
        }

        const user = await User.findByPk(resetToken.user_id, {
            include: [{ model: Rol, as: "rol", attributes: ["name"], required: false }],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (!user || !user.is_active || !user.email_verified_at) {
            return { reset: false, reason: "invalid_or_expired" };
        }

        // Hash and save the new password.
        const passwordHash = await bcrypt.hash(password, 12);

        await user.update({ password_hash: passwordHash }, { transaction });

        if (user.rol?.name === "Administrator") {
            await AuditLog.create(
                {
                    actor_user_id: user.id,
                    actor_snapshot: user.email.slice(0, 100),
                    action: "UserPasswordReset",
                    target_type: "User",
                    target_id: String(user.id),
                    target_description: "Account password",
                    changes: null,
                    reason: "Account password reset completed.",
                    result: "Success",
                    occurred_at: now,
                },
                { transaction },
            );
        }

        // Consume all outstanding reset tokens for this user.
        await PasswordResetToken.update(
            { used_at: now },
            {
                where: {
                    user_id: user.id,
                    used_at: null,
                },
                transaction,
            },
        );

        return { reset: true, userId: String(user.id) };
    });

    // Revoke sessions only after the transaction commits successfully.
    if (result.reset) {
        endUserSessions(result.userId);
        return { reset: true };
    }

    return result;
}
