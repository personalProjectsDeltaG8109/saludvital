import { afterEach, describe, expect, test } from "@jest/globals";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
    removeSpecialtyLogo,
    storeSpecialtyLogo,
} from "../../src/modules/admin/services/specialtyLogoStorageService.js";

const storedLogos = new Set();

afterEach(async () => {
    await Promise.all([...storedLogos].map((logoUrl) => removeSpecialtyLogo(logoUrl)));
    storedLogos.clear();
});

describe("Specialty logo storage", () => {
    test("stores a compact WebP logo with its image orientation preserved", async () => {
        const png = await sharp({
            create: {
                width: 8,
                height: 6,
                channels: 4,
                background: "#168de2",
            },
        })
            .png()
            .toBuffer();

        const logoUrl = await storeSpecialtyLogo(`data:image/png;base64,${png.toString("base64")}`);
        storedLogos.add(logoUrl);

        expect(logoUrl).toMatch(/^\/uploads\/specialty-logos\/[a-f0-9-]{36}\.webp$/i);

        const logoPath = path.join(
            path.dirname(fileURLToPath(import.meta.url)),
            "../../public",
            logoUrl.slice(1),
        );
        const metadata = await sharp(await readFile(logoPath)).metadata();
        expect(metadata).toMatchObject({ format: "webp", width: 8, height: 6 });
    });

    test.each([
        ["SVG data URL", "data:image/svg+xml;base64,PHN2Zy8+"],
        ["mismatched image contents", "data:image/png;base64,SGVsbG8="],
        ["invalid data URL", "not-an-image"],
    ])("rejects %s", async (_label, dataUrl) => {
        await expect(storeSpecialtyLogo(dataUrl)).rejects.toMatchObject({ statusCode: 400 });
    });

    test("does not delete files outside its generated logo URL format", async () => {
        await expect(removeSpecialtyLogo("/uploads/avatars/profile.webp")).resolves.toBeUndefined();
    });
});
