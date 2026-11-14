import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import request from "supertest";
import { afterAll, describe, expect, test } from "@jest/globals";
import app from "../../app.js";
import { LEGACY_PROFILE_PHOTO_DIRECTORY } from "../../src/shared/services/profilePhotoStorageService.js";

const testPhotoFilename = `${randomUUID()}.png`;
const testPhotoPath = path.join(LEGACY_PROFILE_PHOTO_DIRECTORY, testPhotoFilename);

describe("profile photo static access protection", () => {
    afterAll(async () => {
        await unlink(testPhotoPath).catch(() => {});
    });

    test("blocks unauthenticated direct and encoded legacy photo URLs before static serving", async () => {
        await mkdir(LEGACY_PROFILE_PHOTO_DIRECTORY, { recursive: true });
        await writeFile(testPhotoPath, Buffer.from("legacy private photo fixture"));

        const directResponse = await request(app).get(
            `/uploads/profile-photos/${testPhotoFilename}`,
        );
        const encodedPrefixResponse = await request(app).get(
            `/uploads/%70rofile-photos/${testPhotoFilename}`,
        );

        expect(directResponse.status).toBe(404);
        expect(encodedPrefixResponse.status).toBe(404);
        expect(directResponse.text).toBe("");
        expect(encodedPrefixResponse.text).toBe("");
        expect(directResponse.headers["cache-control"]).toBe("private, no-store");
    });
});
