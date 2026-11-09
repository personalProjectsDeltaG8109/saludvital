import { Doctor, Patient, Rol, User } from "../../../models/associations.js";

function serviceError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parseUserId(value) {
    const userId = Number(value);
    if (!Number.isSafeInteger(userId) || userId < 1) {
        throw serviceError("La cuenta del administrador no es válida.", 400);
    }
    return userId;
}

export function toAdminProfile(user) {
    const patientName = [user.patient?.first_name, user.patient?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
    const displayName =
        user.display_name?.trim() || user.doctor?.display_name?.trim() || patientName || null;
    const initialsSource = displayName || "Administrador";
    const initials = initialsSource
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toLocaleUpperCase("es-CO"))
        .join("");

    return {
        displayName,
        email: user.email,
        pendingEmail: user.pending_email || null,
        emailVerified: Boolean(user.email_verified_at),
        emailVerifiedAt: user.email_verified_at,
        phone: user.phone,
        role: user.rol.name,
        isActive: user.is_active,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        lastLoginAt: user.last_login_at,
        profilePhotoUrl: normalizeProfilePhotoUrl(
            user.profile_photo_url ||
                user.doctor?.profile_photo_url ||
                user.patient?.profile_photo_url,
        ),
        adminNotificationsEnabled: Boolean(user.admin_notifications_enabled ?? true),
        initials,
    };
}

/** Return only the authenticated administrator's safe, persisted profile fields. */
export async function getAdminProfile(rawUserId) {
    const userId = parseUserId(rawUserId);
    const user = await User.findByPk(userId, {
        attributes: [
            "id",
            "display_name",
            "email",
            "email_verified_at",
            "pending_email",
            "phone",
            "profile_photo_url",
            "admin_notifications_enabled",
            "is_active",
            "created_at",
            "updated_at",
            "last_login_at",
        ],
        include: [
            { model: Rol, as: "rol", attributes: ["name"], required: true },
            {
                model: Doctor,
                as: "doctor",
                attributes: ["display_name", "profile_photo_url"],
                required: false,
            },
            {
                model: Patient,
                as: "patient",
                attributes: ["first_name", "last_name", "profile_photo_url"],
                required: false,
            },
        ],
    });

    if (!user || user.rol?.name !== "Administrator") {
        throw serviceError("No encontramos el perfil de administrador solicitado.", 404);
    }

    return toAdminProfile(user);
}

/** Return only safe identity fields for the authenticated administrator header. */
export async function getAdminHeaderIdentity(rawUserId) {
    const userId = parseUserId(rawUserId);
    const user = await User.findByPk(userId, {
        attributes: ["id", "display_name", "is_active", "profile_photo_url"],
        include: [{ model: Rol, as: "rol", attributes: ["name"], required: true }],
    });

    if (!user || !user.is_active || user.rol?.name !== "Administrator") {
        throw serviceError("No encontramos el perfil de administrador solicitado.", 404);
    }

    return {
        displayName: normalizeAdminHeaderName(user.display_name),
        roleLabel: "Administrador",
        photoUrl: normalizeAdminHeaderPhotoUrl(user.profile_photo_url),
    };
}

function normalizeAdminHeaderName(value) {
    if (typeof value !== "string") return "Administrador";
    return value.trim() || "Administrador";
}

function normalizeProfilePhotoUrl(value) {
    return typeof value === "string" &&
        /^\/(?:uploads\/profile-photos|brand\/patient)\/[\w.-]+\.(?:jpe?g|png|webp)$/i.test(value)
        ? value
        : null;
}

function normalizeAdminHeaderPhotoUrl(value) {
    return typeof value === "string" &&
        /^\/uploads\/profile-photos\/[\w.-]+\.(?:jpe?g|png|webp)$/i.test(value)
        ? value
        : null;
}
