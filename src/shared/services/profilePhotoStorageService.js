import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;
export const PROFILE_PHOTO_URL_PREFIX = "/uploads/profile-photos/";
export const PRIVATE_PROFILE_PHOTO_DIRECTORY = fileURLToPath(
    new URL("../../../private/profile-photos/", import.meta.url),
);
export const LEGACY_PROFILE_PHOTO_DIRECTORY = fileURLToPath(
    new URL("../../../public/uploads/profile-photos/", import.meta.url),
);

const MAX_PROFILE_PHOTO_PIXELS = 40_000_000;
const PROFILE_PHOTO_EXTENSIONS = new Set(["jpg", "png", "webp"]);
const PROFILE_PHOTO_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i;
const PROFILE_PHOTO_URL = /^\/uploads\/profile-photos\/([a-f0-9-]{36})\.(jpg|png|webp)$/i;

function invalidPhoto(reason) {
    const error = new Error("La foto debe ser JPG, PNG o WebP y no superar 2 MB.");
    error.code = reason;
    error.status = 400;
    error.statusCode = 400;
    return error;
}

function hasExpectedSignature(bytes, extension) {
    if (extension === "jpg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (extension === "png") {
        return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    }
    return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

function extensionForMimeType(mimeType) {
    return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[mimeType];
}

/** Validate the data URL's declared type and basic bytes before image decoding. */
export function decodeProfilePhoto(dataUrl) {
    if (typeof dataUrl !== "string") throw invalidPhoto("PROFILE_PHOTO_INVALID_INPUT");

    const match = PROFILE_PHOTO_DATA_URL.exec(dataUrl);
    if (!match) throw invalidPhoto("PROFILE_PHOTO_UNSUPPORTED_FORMAT");

    const extension = extensionForMimeType(match[1].toLowerCase());
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length || bytes.length > MAX_PROFILE_PHOTO_BYTES) {
        throw invalidPhoto("PROFILE_PHOTO_INVALID_SIZE");
    }
    if (!hasExpectedSignature(bytes, extension)) {
        throw invalidPhoto("PROFILE_PHOTO_INVALID_CONTENT");
    }

    return { bytes, extension };
}

/** Re-encode supported images to remove EXIF, GPS, and other embedded metadata. */
export async function sanitizeProfilePhoto(bytes, extension) {
    if (
        !Buffer.isBuffer(bytes) ||
        bytes.length === 0 ||
        bytes.length > MAX_PROFILE_PHOTO_BYTES ||
        !PROFILE_PHOTO_EXTENSIONS.has(extension) ||
        !hasExpectedSignature(bytes, extension)
    ) {
        throw invalidPhoto("PROFILE_PHOTO_INVALID_INPUT");
    }

    try {
        const image = sharp(bytes, {
            failOn: "error",
            limitInputPixels: MAX_PROFILE_PHOTO_PIXELS,
        });
        const metadata = await image.metadata();
        const actualExtension = { jpeg: "jpg", png: "png", webp: "webp" }[metadata.format];
        if (actualExtension !== extension || !metadata.width || !metadata.height) {
            throw invalidPhoto("PROFILE_PHOTO_INVALID_CONTENT");
        }

        const sanitizedBytes = await image
            .rotate()
            .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 85, effort: 4 })
            .toBuffer();

        if (sanitizedBytes.length > MAX_PROFILE_PHOTO_BYTES) {
            throw invalidPhoto("PROFILE_PHOTO_INVALID_SIZE");
        }

        return sanitizedBytes;
    } catch (error) {
        if (error.code?.startsWith("PROFILE_PHOTO_")) throw error;
        throw invalidPhoto("PROFILE_PHOTO_INVALID_CONTENT");
    }
}

/** Save a sanitized image outside the public static directory. */
export async function storeDecodedProfilePhoto({ bytes, extension }) {
    const sanitizedBytes = await sanitizeProfilePhoto(bytes, extension);
    const filename = `${randomUUID()}.webp`;
    await mkdir(PRIVATE_PROFILE_PHOTO_DIRECTORY, { recursive: true });
    await writeFile(path.join(PRIVATE_PROFILE_PHOTO_DIRECTORY, filename), sanitizedBytes, {
        flag: "wx",
    });
    return `${PROFILE_PHOTO_URL_PREFIX}${filename}`;
}

export async function storeProfilePhoto(dataUrl) {
    return storeDecodedProfilePhoto(decodeProfilePhoto(dataUrl));
}

/** Read new private files or sanitize legacy public files before returning them. */
export async function readStoredProfilePhoto(photoUrl) {
    const match = typeof photoUrl === "string" ? PROFILE_PHOTO_URL.exec(photoUrl) : null;
    if (!match) return null;

    const [, photoId, legacyExtension] = match;
    const privatePhotoPath = path.join(PRIVATE_PROFILE_PHOTO_DIRECTORY, `${photoId}.webp`);
    try {
        return await readFile(privatePhotoPath);
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }

    const legacyPhotoPath = path.join(
        LEGACY_PROFILE_PHOTO_DIRECTORY,
        `${photoId}.${legacyExtension}`,
    );
    try {
        const legacyBytes = await readFile(legacyPhotoPath);
        return await sanitizeProfilePhoto(legacyBytes, legacyExtension);
    } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
    }
}

/** Remove both private and legacy copies after a profile photo is replaced or deleted. */
export async function removeStoredProfilePhoto(photoUrl) {
    const match = typeof photoUrl === "string" ? PROFILE_PHOTO_URL.exec(photoUrl) : null;
    if (!match) return;

    const [, photoId, legacyExtension] = match;
    const filePaths = [
        path.join(PRIVATE_PROFILE_PHOTO_DIRECTORY, `${photoId}.webp`),
        path.join(LEGACY_PROFILE_PHOTO_DIRECTORY, `${photoId}.${legacyExtension}`),
    ];

    await Promise.all(
        filePaths.map(async (filePath) => {
            try {
                await unlink(filePath);
            } catch (error) {
                if (error.code !== "ENOENT") throw error;
            }
        }),
    );
}
