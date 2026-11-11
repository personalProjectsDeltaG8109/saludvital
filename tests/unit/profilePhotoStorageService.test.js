import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "@jest/globals";
import {
    decodeProfilePhoto,
    removeStoredProfilePhoto,
    storeDecodedProfilePhoto,
} from "../../src/shared/services/profilePhotoStorageService.js";

describe("shared profile photo storage", () => {
    test("accepts a PNG data URL and decodes its content", () => {
        const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const photo = decodeProfilePhoto(`data:image/png;base64,${pngHeader.toString("base64")}`);

        expect(photo.extension).toBe("png");
        expect(photo.bytes).toEqual(pngHeader);
    });

    test("accepts JPG and WEBP signatures", () => {
        const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
        const webp = Buffer.from("RIFFxxxxWEBP");

        expect(
            decodeProfilePhoto(`data:image/jpeg;base64,${jpeg.toString("base64")}`).extension,
        ).toBe("jpg");
        expect(
            decodeProfilePhoto(`data:image/webp;base64,${webp.toString("base64")}`).extension,
        ).toBe("webp");
    });

    test("rejects unsupported formats, invalid content, and oversized files", () => {
        expect(() => decodeProfilePhoto("data:image/svg+xml;base64,PHN2Zz4=")).toThrow(
            "La foto debe ser JPG, PNG o WebP y no superar 2 MB.",
        );
        expect(() => decodeProfilePhoto("data:image/png;base64,aGVsbG8=")).toThrow(
            "La foto debe ser JPG, PNG o WebP y no superar 2 MB.",
        );
        const oversizedImage = Buffer.alloc(2 * 1024 * 1024 + 1, 0);
        expect(() =>
            decodeProfilePhoto(`data:image/png;base64,${oversizedImage.toString("base64")}`),
        ).toThrow("La foto debe ser JPG, PNG o WebP y no superar 2 MB.");
    });

    test("stores valid photos and removes only managed profile photo files", async () => {
        const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const directory = fileURLToPath(
            new URL("../../public/uploads/profile-photos/", import.meta.url),
        );
        const photoUrl = await storeDecodedProfilePhoto({ bytes: pngHeader, extension: "png" });
        const photoPath = path.join(directory, path.basename(photoUrl));

        try {
            expect(photoUrl).toMatch(/^\/uploads\/profile-photos\/[\w-]+\.png$/);
            expect(await readFile(photoPath)).toEqual(pngHeader);
            await removeStoredProfilePhoto("/uploads/other/file.png");
            await access(photoPath);
        } finally {
            await removeStoredProfilePhoto(photoUrl);
        }

        await expect(access(photoPath)).rejects.toMatchObject({ code: "ENOENT" });
    });
});
