import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import database from "../../../../config/database.js";
import { Patient, User } from "../../../models/associations.js";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const PHOTO_DIRECTORY = fileURLToPath(
    new URL("../../../../public/uploads/profile-photos/", import.meta.url),
);
const PHOTO_TYPES = {
    "image/jpeg": {
        extension: "jpg",
        signature: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
    },
    "image/png": {
        extension: "png",
        signature: (buffer) =>
            buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    },
    "image/webp": {
        extension: "webp",
        signature: (buffer) =>
            buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP",
    },
};

function profileError(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function parseImage(dataUrl) {
    if (typeof dataUrl !== "string") throw profileError("Selecciona una imagen válida.");
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match) throw profileError("Usa una imagen JPG, PNG o WEBP.");

    const [, mimeType, encoded] = match;
    const buffer = Buffer.from(encoded, "base64");
    if (!buffer.length || buffer.length > MAX_PHOTO_BYTES) {
        throw profileError("La foto debe pesar como máximo 2 MB.");
    }
    if (!PHOTO_TYPES[mimeType].signature(buffer)) {
        throw profileError("El archivo no coincide con el formato de imagen indicado.");
    }
    return { buffer, extension: PHOTO_TYPES[mimeType].extension };
}

async function removeStoredPhoto(photoUrl) {
    if (typeof photoUrl !== "string" || !photoUrl.startsWith("/uploads/profile-photos/")) return;
    const filename = path.basename(photoUrl);
    await unlink(path.join(PHOTO_DIRECTORY, filename)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
    });
}

export async function updatePatientProfilePhoto(userId, dataUrl) {
    const { buffer, extension } = parseImage(dataUrl);
    const patient = await Patient.findOne({ where: { user_id: userId } });
    if (!patient) throw profileError("No se encontró el perfil del paciente.", 404);

    // Keep the current URL before updating the model so only the old file is removed.
    const previousPhotoUrl = patient.profile_photo_url;
    await mkdir(PHOTO_DIRECTORY, { recursive: true });
    const filename = `${randomUUID()}.${extension}`;
    const photoUrl = `/uploads/profile-photos/${filename}`;
    await writeFile(path.join(PHOTO_DIRECTORY, filename), buffer, { flag: "wx" });

    try {
        await patient.update({ profile_photo_url: photoUrl });
    } catch (error) {
        await removeStoredPhoto(photoUrl);
        throw error;
    }

    await removeStoredPhoto(previousPhotoUrl);
    return photoUrl;
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
                },
                { transaction },
            );

            return { photoUrl };
        })
        .then(async (result) => {
            await removeStoredPhoto(result.photoUrl);
            return result;
        });
}
