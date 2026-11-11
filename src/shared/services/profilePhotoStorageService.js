import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const PHOTO_DIRECTORY = fileURLToPath(
    new URL("../../../public/uploads/profile-photos/", import.meta.url),
);
const PHOTO_URL_PREFIX = "/uploads/profile-photos/";
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

function invalidPhoto(reason) {
    const error = new Error("La foto debe ser JPG, PNG o WebP y no superar 2 MB.");
    error.code = reason;
    error.status = 400;
    error.statusCode = 400;
    return error;
}

/** Decode only supported image data and verify its bytes match the declared format. */
export function decodeProfilePhoto(dataUrl) {
    if (typeof dataUrl !== "string") throw invalidPhoto("PROFILE_PHOTO_INVALID_INPUT");

    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl);
    if (!match) throw invalidPhoto("PROFILE_PHOTO_UNSUPPORTED_FORMAT");

    const type = PHOTO_TYPES[match[1].toLowerCase()];
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) {
        throw invalidPhoto("PROFILE_PHOTO_INVALID_SIZE");
    }
    if (!type.signature(bytes)) throw invalidPhoto("PROFILE_PHOTO_INVALID_CONTENT");

    return { bytes, extension: type.extension };
}

export async function storeDecodedProfilePhoto({ bytes, extension }) {
    if (
        !Buffer.isBuffer(bytes) ||
        bytes.length === 0 ||
        bytes.length > MAX_PHOTO_BYTES ||
        !Object.values(PHOTO_TYPES).some((type) => type.extension === extension)
    ) {
        throw invalidPhoto("PROFILE_PHOTO_INVALID_INPUT");
    }

    const filename = `${randomUUID()}.${extension}`;
    await mkdir(PHOTO_DIRECTORY, { recursive: true });
    await writeFile(path.join(PHOTO_DIRECTORY, filename), bytes, { flag: "wx" });
    return `${PHOTO_URL_PREFIX}${filename}`;
}

export async function storeProfilePhoto(dataUrl) {
    return storeDecodedProfilePhoto(decodeProfilePhoto(dataUrl));
}

export async function removeStoredProfilePhoto(photoUrl) {
    if (typeof photoUrl !== "string" || !photoUrl.startsWith(PHOTO_URL_PREFIX)) return;

    const filename = path.basename(photoUrl);
    if (!filename || filename === "." || filename === "..") return;

    try {
        await unlink(path.join(PHOTO_DIRECTORY, filename));
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
}
