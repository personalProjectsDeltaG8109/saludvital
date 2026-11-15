import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { sanitizeProfilePhoto } from "./profilePhotoStorageService.js";

const LEGACY_FILENAME_PATTERN = /^([a-f0-9-]{36})\.(jpg|png|webp)$/i;

async function isSanitizedWebp(filePath) {
    try {
        const fileBytes = await readFile(filePath);
        const metadata = await sharp(fileBytes, { failOn: "error" }).metadata();
        return (
            metadata.format === "webp" &&
            !metadata.exif &&
            !metadata.iptc &&
            !metadata.xmp &&
            !metadata.icc
        );
    } catch {
        return false;
    }
}

/** Move legacy public photos only after a private, metadata-free copy is verified. */
export async function migrateLegacyProfilePhotos({
    sourceDirectory,
    destinationDirectory,
    dryRun = true,
}) {
    const entries = await readdir(sourceDirectory, { withFileTypes: true }).catch((error) => {
        if (error.code === "ENOENT") return [];
        throw error;
    });
    const result = { scanned: 0, migrated: 0, skipped: 0, failed: 0, dryRun };

    for (const entry of entries) {
        const match = entry.isFile() ? LEGACY_FILENAME_PATTERN.exec(entry.name) : null;
        if (!match) continue;

        result.scanned += 1;
        const [, photoId, extension] = match;
        const sourcePath = path.join(sourceDirectory, entry.name);
        const destinationPath = path.join(destinationDirectory, `${photoId}.webp`);

        if (dryRun) {
            result.skipped += 1;
            continue;
        }

        try {
            if (await isSanitizedWebp(destinationPath)) {
                await unlink(sourcePath);
                result.migrated += 1;
                continue;
            }

            const sourceBytes = await readFile(sourcePath);
            const sanitizedBytes = await sanitizeProfilePhoto(sourceBytes, extension);
            await mkdir(destinationDirectory, { recursive: true });
            await writeFile(destinationPath, sanitizedBytes, { flag: "wx" });

            if (!(await isSanitizedWebp(destinationPath))) {
                await unlink(destinationPath).catch(() => {});
                throw new Error("The private profile photo failed verification.");
            }

            await unlink(sourcePath);
            result.migrated += 1;
        } catch (error) {
            // Leave the source photo in place when the private copy cannot be verified.
            result.failed += 1;
            if (error.code === "EEXIST" && (await isSanitizedWebp(destinationPath))) {
                await unlink(sourcePath);
                result.failed -= 1;
                result.migrated += 1;
            }
        }
    }

    return result;
}
