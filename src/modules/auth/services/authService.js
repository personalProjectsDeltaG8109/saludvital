import bcrypt from "bcrypt";
import database from "../../../../config/database.js";
import { Rol, User } from "../../../models/associations.js";
import { isPasswordWithinSupportedLength } from "./passwordPolicy.js";

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000;

export class EmailVerificationRequiredError extends Error {
    constructor(message) {
        super(message);
        this.name = "EmailVerificationRequiredError";
        this.statusCode = 403;
    }
}

export class AuthenticationError extends Error {
    constructor() {
        super("Inválido el correo electrónico o la contraseña.");
        this.name = "AuthenticationError";
        this.statusCode = 401;
    }
}

export class LoginTemporarilyLockedError extends Error {
    constructor(lockedUntil) {
        super("Demasiados intentos fallidos. El inicio de sesión está bloqueado temporalmente.");
        this.name = "LoginTemporarilyLockedError";
        this.statusCode = 429;
        this.lockedUntil = lockedUntil;
    }
}

// Authenticate an active user while serializing updates to its lockout counter.
export async function authenticateUser(email, password) {
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (
        !normalizedEmail ||
        normalizedEmail.length > 320 ||
        !isPasswordWithinSupportedLength(password) ||
        password.length === 0
    ) {
        throw new AuthenticationError();
    }

    const result = await database.transaction(async (transaction) => {
        const user = await User.findOne({
            where: {
                email: normalizedEmail,
                is_active: true,
            },
            include: [
                {
                    model: Rol,
                    as: "rol",
                    attributes: ["id", "name"],
                    required: true,
                },
            ],
            lock: transaction.LOCK.UPDATE,
            transaction,
        });

        if (!user) {
            return { outcome: "invalid" };
        }

        const now = new Date();
        const lockExpiresAt = user.login_locked_until ? new Date(user.login_locked_until) : null;

        if (lockExpiresAt && lockExpiresAt > now) {
            return { outcome: "locked", lockedUntil: lockExpiresAt };
        }

        const failedAttempts = lockExpiresAt ? 0 : Number(user.failed_login_attempts || 0);

        if (lockExpiresAt) {
            await user.update(
                {
                    failed_login_attempts: 0,
                    login_locked_until: null,
                },
                { transaction },
            );
        }

        const passwordMatches = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatches) {
            const nextFailedAttempts = failedAttempts + 1;
            const loginLockedUntil =
                nextFailedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS
                    ? new Date(now.getTime() + LOGIN_LOCK_DURATION_MS)
                    : null;

            await user.update(
                {
                    failed_login_attempts: nextFailedAttempts,
                    login_locked_until: loginLockedUntil,
                },
                { transaction },
            );

            if (loginLockedUntil) {
                return { outcome: "locked", lockedUntil: loginLockedUntil };
            }

            return { outcome: "invalid" };
        }

        if (!user.email_verified_at) {
            return { outcome: "unverified" };
        }

        await user.update(
            {
                last_login_at: now,
            },
            { transaction },
        );

        return {
            outcome: "authenticated",
            user: {
                id: user.id,
                email: user.email,
                role: user.rol.name,
            },
        };
    });

    if (result.outcome === "unverified") {
        throw new EmailVerificationRequiredError(
            "Please verify your email address before signing in.",
        );
    }

    if (result.outcome === "locked") {
        throw new LoginTemporarilyLockedError(result.lockedUntil);
    }

    if (result.outcome !== "authenticated") {
        throw new AuthenticationError();
    }

    return result.user;
}

// Clear failed attempts only after the controller establishes the login session.
export async function clearLoginFailures(userId) {
    await User.update(
        {
            failed_login_attempts: 0,
            login_locked_until: null,
        },
        {
            where: { id: userId },
        },
    );
}
