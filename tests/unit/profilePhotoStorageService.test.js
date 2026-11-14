import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, test } from "@jest/globals";
import {
    PRIVATE_PROFILE_PHOTO_DIRECTORY,
    LEGACY_PROFILE_PHOTO_DIRECTORY,
    decodeProfilePhoto,
    readStoredProfilePhoto,
    removeStoredProfilePhoto,
    sanitizeProfilePhoto,
    storeDecodedProfilePhoto,
} from "../../src/shared/services/profilePhotoStorageService.js";

async function createJpegWithMetadata() {
    return sharp({
        create: { width: 32, height: 24, channels: 3, background: "#336699" },
    })
        .jpeg()
        .withMetadata({ exif: { IFD0: { Artist: "Private test metadata" } } })
        .toBuffer();
}

describe("shared profile photo storage", () => {
    test("accepts supported image data URLs and rejects invalid input", async () => {
        const jpeg = await createJpegWithMetadata();
        const photo = decodeProfilePhoto(`data:image/jpeg;base64,${jpeg.toString("base64")}`);

        expect(photo.extension).toBe("jpg");
        expect(photo.bytes).toEqual(jpeg);
        expect(() => decodeProfilePhoto("data:image/svg+xml;base64,PHN2Zz4=")).toThrow(
            "La foto debe ser JPG, PNG o WebP y no superar 2 MB.",
        );
        expect(() => decodeProfilePhoto("data:image/png;base64,aGVsbG8=")).toThrow(
            "La foto debe ser JPG, PNG o WebP y no superar 2 MB.",
        );
    });

    test("re-encodes images without carrying embedded metadata", async () => {
        const originalBytes = await createJpegWithMetadata();
        const originalMetadata = await sharp(originalBytes).metadata();
        const sanitizedBytes = await sanitizeProfilePhoto(originalBytes, "jpg");
        const sanitizedMetadata = await sharp(sanitizedBytes).metadata();

        expect(originalMetadata.exif).toBeDefined();
        expect(sanitizedMetadata.format).toBe("webp");
        expect(sanitizedMetadata.exif).toBeUndefined();
        expect(sanitizedMetadata.iptc).toBeUndefined();
        expect(sanitizedMetadata.xmp).toBeUndefined();
        expect(sanitizedMetadata.icc).toBeUndefined();
    });

    test("stores photos outside public and can read and remove the protected file", async () => {
        const jpeg = await createJpegWithMetadata();
        const photoUrl = await storeDecodedProfilePhoto({ bytes: jpeg, extension: "jpg" });
        const photoPath = path.join(PRIVATE_PROFILE_PHOTO_DIRECTORY, path.basename(photoUrl));

        try {
            expect(photoUrl).toMatch(/^\/uploads\/profile-photos\/[\w-]+\.webp$/);
            expect(await readFile(photoPath)).toEqual(await readStoredProfilePhoto(photoUrl));
            expect(await sharp(await readFile(photoPath)).metadata()).toMatchObject({
                format: "webp",
            });
        } finally {
            await removeStoredProfilePhoto(photoUrl);
        }

        await expect(access(photoPath)).rejects.toMatchObject({ code: "ENOENT" });
        expect(await readStoredProfilePhoto(photoUrl)).toBeNull();
        await expect(
            sanitizeProfilePhoto(Buffer.alloc(2 * 1024 * 1024 + 1), "png"),
        ).rejects.toMatchObject({ code: "PROFILE_PHOTO_INVALID_INPUT" });
    });

    test("sanitizes legacy public files before returning their bytes", async () => {
        const legacyFilename = "123e4567-e89b-42d3-a456-426614174000.jpg";
        const legacyPhotoPath = path.join(LEGACY_PROFILE_PHOTO_DIRECTORY, legacyFilename);
        const legacyPhotoUrl = `/uploads/profile-photos/${legacyFilename}`;
        await mkdir(LEGACY_PROFILE_PHOTO_DIRECTORY, { recursive: true });
        await writeFile(legacyPhotoPath, await createJpegWithMetadata());

        try {
            const servedMetadata = await sharp(
                await readStoredProfilePhoto(legacyPhotoUrl),
            ).metadata();
            expect(servedMetadata.format).toBe("webp");
            expect(servedMetadata.exif).toBeUndefined();
        } finally {
            await unlink(legacyPhotoPath);
        }
    });
});
