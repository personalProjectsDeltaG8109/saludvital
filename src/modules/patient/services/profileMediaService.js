import bcrypt from "bcrypt";
import database from "../../../../config/database.js";
import { Patient, User } from "../../../models/associations.js";
import {
    decodeProfilePhoto,
    removeStoredProfilePhoto,
    storeDecodedProfilePhoto,
} from "../../../shared/services/profilePhotoStorageService.js";

function profileError(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function parsePatientPhoto(dataUrl) {
    try {
        return decodeProfilePhoto(dataUrl);
    } catch (error) {
        const messageByReason = {
            PROFILE_PHOTO_INVALID_INPUT: "Selecciona una imagen v\u00e1lida.",
            PROFILE_PHOTO_UNSUPPORTED_FORMAT: "Usa una imagen JPG, PNG o WEBP.",
            PROFILE_PHOTO_INVALID_SIZE: "La foto debe pesar como m\u00e1ximo 2 MB.",
            PROFILE_PHOTO_INVALID_CONTENT:
                "El archivo no coincide con el formato de imagen indicado.",
        };
        throw profileError(messageByReason[error.code] || "Usa una imagen JPG, PNG o WEBP.");
    }
}

export async function updatePatientProfilePhoto(userId, dataUrl) {
    const decodedPhoto = parsePatientPhoto(dataUrl);
    const patient = await Patient.findOne({ where: { user_id: userId } });
    if (!patient) throw profileError("No se encontró el perfil del paciente.", 404);

    // Keep the current URL before updating the model so only the old file is removed.
    const previousPhotoUrl = patient.profile_photo_url;
    const photoUrl = await storeDecodedProfilePhoto(decodedPhoto);

    try {
        await patient.update({ profile_photo_url: photoUrl });
    } catch (error) {
        await removeStoredProfilePhoto(photoUrl);
        throw error;
    }

    await removeStoredProfilePhoto(previousPhotoUrl);
    return photoUrl;
}

// Clear the authenticated patient's photo and remove its stored file when applicable.
export async function deletePatientProfilePhoto(userId) {
    const patient = await Patient.findOne({ where: { user_id: userId } });
    if (!patient) throw profileError("No se encontró el perfil del paciente.", 404);

    const previousPhotoUrl = patient.profile_photo_url;
    await patient.update({ profile_photo_url: null });
    await removeStoredProfilePhoto(previousPhotoUrl);
}

export async function deactivatePatientAccount(userId, password) {
    if (typeof password !== "string" || !password) {
        throw profileError("Ingresa tu contraseña para confirmar la eliminación.");
    }

    return database
        .transaction(async (transaction) => {
            const user = await User.findByPk(userId, {
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!user || !user.is_active) throw profileError("La cuenta no está disponible.", 404);

            if (!(await bcrypt.compare(password, user.password_hash))) {
                throw profileError("La contraseña no es correcta.", 401);
            }

            const patient = await Patient.findOne({
                where: { user_id: userId },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            const photoUrl = patient?.profile_photo_url || null;
            if (patient) await patient.update({ profile_photo_url: null }, { transaction });
            await user.update(
                {
                    is_active: false,
                    email_verification_token_hash: null,
                    email_verification_expires_at: null,
                    pending_email: null,
                    email_verification_requested_at: null,
                },
                { transaction },
            );

            return { photoUrl };
        })
        .then(async (result) => {
            await removeStoredProfilePhoto(result.photoUrl);
            return result;
        });
}
