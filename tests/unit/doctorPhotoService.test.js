import { describe, expect, test } from "@jest/globals";
import { decodeDoctorPhoto } from "../../src/modules/admin/services/doctorPhotoService.js";

describe("Admin doctor photo validation", () => {
    test("accepts a PNG data URL and decodes its content", () => {
        const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const photo = decodeDoctorPhoto(`data:image/png;base64,${pngHeader.toString("base64")}`);

        expect(photo.extension).toBe("png");
        expect(photo.bytes).toEqual(pngHeader);
    });

    test("rejects unsupported data and image content", () => {
        expect(() => decodeDoctorPhoto("data:image/svg+xml;base64,PHN2Zz4=")).toThrow(
            "La foto debe ser JPG, PNG o WebP y no superar 2 MB.",
        );
        expect(() => decodeDoctorPhoto("data:image/png;base64,aGVsbG8=")).toThrow(
            "La foto debe ser JPG, PNG o WebP y no superar 2 MB.",
        );
    });
});
