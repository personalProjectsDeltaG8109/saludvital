import database from "../../../../config/database.js";
import AuditLog from "../../../models/AuditLog.js";
import { Rol, User } from "../../../models/associations.js";
import { decodeDoctorPhoto, removeDoctorPhoto, storeDoctorPhoto } from "./doctorPhotoService.js";

function serviceError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parseUserId(value) {
    const userId = Number(value);
    if (!Number.isSafeInteger(userId) || userId < 1) {
        throw serviceError("La cuenta del administrador no es válida.");
    }
    return userId;
}

async function findAdministrator(userId, transaction) {
    const user = await User.findByPk(userId, {
        attributes: ["id", "email", "is_active", "profile_photo_url"],
        include: [{ model: Rol, as: "rol", attributes: ["name"], required: true }],
        transaction,
        lock: transaction.LOCK.UPDATE,
    });

    if (!user || !user.is_active || user.rol?.name !== "Administrator") {
        throw serviceError("No encontramos el perfil de administrador.", 404);
    }

    return user;
}

function createPhotoAuditRecord(user, action, transaction) {
    return AuditLog.create(
        {
            actor_user_id: user.id,
            actor_snapshot: `Administrator ${user.email}`.slice(0, 100),
            action,
            target_type: "User",
            target_id: String(user.id),
            target_description: "Administrator profile photo",
            changes: null,
            reason: "Administrator updated own profile photo.",
            result: "Success",
            occurred_at: new Date(),
        },
        { transaction },
    );
}

function isStoredProfilePhoto(photoUrl) {
    return typeof photoUrl === "string" && photoUrl.startsWith("/uploads/profile-photos/");
}

/** Save a new photo for the authenticated administrator without losing the current image on failure. */
export async function updateAdminProfilePhoto(rawUserId, dataUrl) {
    const userId = parseUserId(rawUserId);
    decodeDoctorPhoto(dataUrl);
    let newPhotoUrl = null;
    let previousPhotoUrl = null;

    try {
        newPhotoUrl = await database.transaction(async (transaction) => {
            const user = await findAdministrator(userId, transaction);
            previousPhotoUrl = user.profile_photo_url;

            const photoUrl = await storeDoctorPhoto(dataUrl);
            newPhotoUrl = photoUrl;
            await user.update({ profile_photo_url: photoUrl }, { transaction });
            await createPhotoAuditRecord(user, "AdminUserProfilePhotoUpdated", transaction);
            return photoUrl;
        });
    } catch (error) {
        if (newPhotoUrl) await removeDoctorPhoto(newPhotoUrl).catch(() => {});
        throw error;
    }

    if (isStoredProfilePhoto(previousPhotoUrl) && previousPhotoUrl !== newPhotoUrl) {
        await removeDoctorPhoto(previousPhotoUrl).catch(() => {});
    }

    return {
        profilePhotoUrl: newPhotoUrl,
        message: "Tu foto de perfil se actualizó correctamente.",
    };
}

/** Remove the authenticated administrator's photo while keeping the account record. */
export async function removeAdminProfilePhoto(rawUserId) {
    const userId = parseUserId(rawUserId);
    const result = await database.transaction(async (transaction) => {
        const user = await findAdministrator(userId, transaction);
        const previousPhotoUrl = user.profile_photo_url;
        if (!previousPhotoUrl) return { changed: false, previousPhotoUrl: null };

        await user.update({ profile_photo_url: null }, { transaction });
        await createPhotoAuditRecord(user, "AdminUserProfilePhotoRemoved", transaction);
        return { changed: true, previousPhotoUrl };
    });

    if (isStoredProfilePhoto(result.previousPhotoUrl)) {
        await removeDoctorPhoto(result.previousPhotoUrl).catch(() => {});
    }

    return {
        profilePhotoUrl: null,
        message: result.changed
            ? "Tu foto de perfil se eliminó correctamente."
            : "No tienes una foto de perfil para eliminar.",
    };
}
