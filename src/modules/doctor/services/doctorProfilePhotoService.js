import database from "../../../../config/database.js";
import { Doctor } from "../../../models/associations.js";
import {
    decodeProfilePhoto,
    removeStoredProfilePhoto,
    storeDecodedProfilePhoto,
} from "../../../shared/services/profilePhotoStorageService.js";

function createPhotoError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parseUserId(value) {
    const userId = Number(value);
    if (!Number.isSafeInteger(userId) || userId < 1) {
        throw createPhotoError("La cuenta médica no es válida.", 400);
    }
    return userId;
}

function isStoredDoctorPhoto(photoUrl) {
    return typeof photoUrl === "string" && photoUrl.startsWith("/uploads/profile-photos/");
}

/** Save a photo only to the doctor profile linked to the authenticated user. */
export async function updateDoctorProfilePhoto(rawUserId, dataUrl) {
    const userId = parseUserId(rawUserId);
    const decodedPhoto = decodeProfilePhoto(dataUrl);

    let newPhotoUrl = null;
    let previousPhotoUrl = null;

    try {
        await database.transaction(async (transaction) => {
            const doctor = await Doctor.findOne({
                where: { user_id: userId },
                attributes: ["id", "profile_photo_url"],
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!doctor) throw createPhotoError("No se encontró el perfil médico.", 404);

            previousPhotoUrl = doctor.profile_photo_url;
            const photoUrl = await storeDecodedProfilePhoto(decodedPhoto);
            newPhotoUrl = photoUrl;
            await doctor.update({ profile_photo_url: photoUrl }, { transaction });
            return photoUrl;
        });
    } catch (error) {
        if (newPhotoUrl) await removeStoredProfilePhoto(newPhotoUrl).catch(() => {});
        throw error;
    }

    if (isStoredDoctorPhoto(previousPhotoUrl) && previousPhotoUrl !== newPhotoUrl) {
        await removeStoredProfilePhoto(previousPhotoUrl).catch(() => {});
    }

    return {
        profilePhotoUrl: newPhotoUrl,
        message: "Tu foto de perfil se actualizó correctamente.",
    };
}
