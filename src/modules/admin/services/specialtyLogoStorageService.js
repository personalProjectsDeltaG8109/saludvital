import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export const MAX_SPECIALTY_LOGO_BYTES = 2 * 1024 * 1024;
export const SPECIALTY_LOGO_URL_PREFIX = "/uploads/specialty-logos/";
const SPECIALTY_LOGO_DIRECTORY = fileURLToPath(
    new URL("../../../../public/uploads/specialty-logos/", import.meta.url),
);
const MAX_SPECIALTY_LOGO_PIXELS = 20_000_000;
const SPECIALTY_LOGO_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i;
const SPECIALTY_LOGO_URL = /^\/uploads\/specialty-logos\/([a-f0-9-]{36})\.webp$/i;

function invalidLogo(reason) {
    const error = new Error("El logo debe ser JPG, PNG o WebP y no superar 2 MB.");
    error.code = reason;
    error.statusCode = 400;
    return error;
}

function matchesImageSignature(bytes, format) {
    if (format === "jpeg") {
        return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    }
    if (format === "png") {
        return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    }
    return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

/** Decode only small base64 image data URLs with a matching file signature. */
function decodeSpecialtyLogo(dataUrl) {
    if (typeof dataUrl !== "string") throw invalidLogo("SPECIALTY_LOGO_INVALID_INPUT");

    const match = SPECIALTY_LOGO_DATA_URL.exec(dataUrl);
    if (!match) throw invalidLogo("SPECIALTY_LOGO_UNSUPPORTED_FORMAT");

    const format = match[1].toLowerCase();
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length || bytes.length > MAX_SPECIALTY_LOGO_BYTES) {
        throw invalidLogo("SPECIALTY_LOGO_INVALID_SIZE");
    }
    if (!matchesImageSignature(bytes, format)) {
        throw invalidLogo("SPECIALTY_LOGO_INVALID_CONTENT");
    }

    return { bytes, format };
}

/** Re-encode logos to WebP to remove metadata and keep stored files compact. */
export async function storeSpecialtyLogo(dataUrl) {
    const { bytes, format } = decodeSpecialtyLogo(dataUrl);

    try {
        const image = sharp(bytes, {
            failOn: "error",
            limitInputPixels: MAX_SPECIALTY_LOGO_PIXELS,
        });
        const metadata = await image.metadata();
        if (metadata.format !== format || !metadata.width || !metadata.height) {
            throw invalidLogo("SPECIALTY_LOGO_INVALID_CONTENT");
        }

        const sanitizedBytes = await image
            .rotate()
            .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 86, effort: 4 })
            .toBuffer();
        if (!sanitizedBytes.length || sanitizedBytes.length > MAX_SPECIALTY_LOGO_BYTES) {
            throw invalidLogo("SPECIALTY_LOGO_INVALID_SIZE");
        }

        const filename = `${randomUUID()}.webp`;
        await mkdir(SPECIALTY_LOGO_DIRECTORY, { recursive: true });
        await writeFile(path.join(SPECIALTY_LOGO_DIRECTORY, filename), sanitizedBytes, {
            flag: "wx",
        });
        return `${SPECIALTY_LOGO_URL_PREFIX}${filename}`;
    } catch (error) {
        if (error.code?.startsWith("SPECIALTY_LOGO_")) throw error;
        throw invalidLogo("SPECIALTY_LOGO_INVALID_CONTENT");
    }
}

/** Remove only generated specialty-logo files from the public upload directory. */
export async function removeSpecialtyLogo(logoUrl) {
    const match = typeof logoUrl === "string" ? SPECIALTY_LOGO_URL.exec(logoUrl) : null;
    if (!match) return;

    try {
        await unlink(path.join(SPECIALTY_LOGO_DIRECTORY, `${match[1]}.webp`));
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
}
