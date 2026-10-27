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

/** Return only the authenticated administrator's safe, persisted profile fields. */
export async function getAdminProfile(rawUserId) {
    const userId = parseUserId(rawUserId);
    const user = await User.findByPk(userId, {
        attributes: ["id", "display_name", "email", "is_active", "created_at", "last_login_at"],
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
        role: user.rol.name,
        isActive: user.is_active,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
        profilePhotoUrl: normalizeProfilePhotoUrl(
            user.doctor?.profile_photo_url || user.patient?.profile_photo_url,
        ),
        initials,
    };
}

function normalizeProfilePhotoUrl(value) {
    return typeof value === "string" &&
        /^\/(?:uploads\/profile-photos|brand\/patient)\/[\w.-]+\.(?:jpe?g|png|webp)$/i.test(value)
        ? value
        : null;
}
