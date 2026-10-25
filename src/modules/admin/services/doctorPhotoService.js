import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const PHOTO_DIRECTORY = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../public/uploads/profile-photos",
);
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const PHOTO_TYPES = {
    "image/jpeg": {
        extension: "jpg",
        signature: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    },
    "image/png": {
        extension: "png",
        signature: (bytes) =>
            bytes
                .subarray(0, 8)
                .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    },
    "image/webp": {
        extension: "webp",
        signature: (bytes) =>
            bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP",
    },
};

function invalidPhoto() {
    const error = new Error("La foto debe ser JPG, PNG o WebP y no superar 2 MB.");
    error.statusCode = 400;
    return error;
}

export function decodeDoctorPhoto(dataUrl) {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-z\d+/]+=*)$/i.exec(dataUrl || "");
    if (!match) throw invalidPhoto();

    const type = PHOTO_TYPES[match[1].toLowerCase()];
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length || bytes.length > MAX_PHOTO_BYTES || !type.signature(bytes))
        throw invalidPhoto();

    return { bytes, extension: type.extension };
}

export async function storeDoctorPhoto(dataUrl) {
    const { bytes, extension } = decodeDoctorPhoto(dataUrl);
    const filename = `${randomUUID()}.${extension}`;
    await mkdir(PHOTO_DIRECTORY, { recursive: true });
    await writeFile(path.join(PHOTO_DIRECTORY, filename), bytes, { flag: "wx" });
    return `/uploads/profile-photos/${filename}`;
}

export async function removeDoctorPhoto(photoUrl) {
    const filename = path.basename(photoUrl || "");
    if (!filename || filename === "." || filename === "..") return;
    try {
        await unlink(path.join(PHOTO_DIRECTORY, filename));
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
}
