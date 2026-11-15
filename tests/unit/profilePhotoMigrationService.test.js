import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, test } from "@jest/globals";
import { migrateLegacyProfilePhotos } from "../../src/shared/services/profilePhotoMigrationService.js";

let temporaryDirectory;

async function createMigrationDirectories() {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "saludvital-profile-photos-"));
    const sourceDirectory = path.join(temporaryDirectory, "public");
    const destinationDirectory = path.join(temporaryDirectory, "private");
    await mkdir(sourceDirectory, { recursive: true });
    return { sourceDirectory, destinationDirectory };
}

async function createMetadataJpeg() {
    return sharp({
        create: { width: 16, height: 12, channels: 3, background: "#2288aa" },
    })
        .jpeg()
        .withMetadata({ exif: { IFD0: { Artist: "Legacy metadata" } } })
        .toBuffer();
}

afterEach(async () => {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = undefined;
});

describe("legacy profile photo migration", () => {
    test("dry run reports matching files without changing either directory", async () => {
        const { sourceDirectory, destinationDirectory } = await createMigrationDirectories();
        const filename = "123e4567-e89b-42d3-a456-426614174000.jpg";
        await writeFile(path.join(sourceDirectory, filename), await createMetadataJpeg());

        const result = await migrateLegacyProfilePhotos({ sourceDirectory, destinationDirectory });

        expect(result).toEqual({ scanned: 1, migrated: 0, skipped: 1, failed: 0, dryRun: true });
        expect(await readdir(sourceDirectory)).toEqual([filename]);
        await expect(readdir(destinationDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    });

    test("apply stores a metadata-free private copy before removing the public original", async () => {
        const { sourceDirectory, destinationDirectory } = await createMigrationDirectories();
        const photoId = "123e4567-e89b-42d3-a456-426614174000";
        const sourcePath = path.join(sourceDirectory, `${photoId}.jpg`);
        const destinationPath = path.join(destinationDirectory, `${photoId}.webp`);
        await writeFile(sourcePath, await createMetadataJpeg());

        const result = await migrateLegacyProfilePhotos({
            sourceDirectory,
            destinationDirectory,
            dryRun: false,
        });
        const migratedMetadata = await sharp(await readFile(destinationPath)).metadata();

        expect(result).toEqual({ scanned: 1, migrated: 1, skipped: 0, failed: 0, dryRun: false });
        expect(await readdir(sourceDirectory)).toEqual([]);
        expect(migratedMetadata.format).toBe("webp");
        expect(migratedMetadata.exif).toBeUndefined();
        expect(migratedMetadata.xmp).toBeUndefined();
    });

    test("leaves invalid originals in place and reports them as failed", async () => {
        const { sourceDirectory, destinationDirectory } = await createMigrationDirectories();
        const filename = "123e4567-e89b-42d3-a456-426614174000.jpg";
        const sourcePath = path.join(sourceDirectory, filename);
        await writeFile(sourcePath, Buffer.from("not an image"));

        const result = await migrateLegacyProfilePhotos({
            sourceDirectory,
            destinationDirectory,
            dryRun: false,
        });

        expect(result.failed).toBe(1);
        expect(await readdir(sourceDirectory)).toEqual([filename]);
        await expect(readdir(destinationDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    });
});
