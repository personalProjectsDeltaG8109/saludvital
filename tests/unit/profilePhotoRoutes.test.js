import express from "express";
import request from "supertest";
import { describe, expect, jest, test } from "@jest/globals";
import { createProfilePhotoRouter } from "../../src/shared/routes/profilePhotoRoutes.js";

const photoUrl = "/uploads/profile-photos/123e4567-e89b-42d3-a456-426614174000.webp";

function createTestApp({ authorized = true, photoBytes = Buffer.from("webp-image") } = {}) {
    const app = express();
    const authorizePhoto = jest.fn().mockResolvedValue(authorized);
    const readPhoto = jest.fn().mockResolvedValue(photoBytes);
    const authenticate = (request, response, next) => {
        request.auth = authorized ? { userId: "7", role: "Patient" } : undefined;
        next();
    };
    app.use(createProfilePhotoRouter({ authenticate, authorizePhoto, readPhoto }));
    return { app, authorizePhoto, readPhoto };
}

describe("protected profile photo routes", () => {
    test("serves authorized photos with private response headers", async () => {
        const { app, authorizePhoto, readPhoto } = createTestApp();
        const response = await request(app).get(photoUrl);

        expect(response.status).toBe(200);
        expect(response.headers["content-type"]).toContain("image/webp");
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(response.headers["x-content-type-options"]).toBe("nosniff");
        expect(response.headers["cross-origin-resource-policy"]).toBe("same-site");
        expect(authorizePhoto).toHaveBeenCalledWith({
            userId: "7",
            role: "Patient",
            photoUrl,
        });
        expect(readPhoto).toHaveBeenCalledWith(photoUrl);
    });

    test("returns the same empty not-found response for denied and missing photos", async () => {
        const deniedApp = createTestApp({ authorized: false }).app;
        const missingApp = createTestApp({ photoBytes: null }).app;

        const deniedResponse = await request(deniedApp).get(photoUrl);
        const missingResponse = await request(missingApp).get(photoUrl);

        expect(deniedResponse.status).toBe(404);
        expect(missingResponse.status).toBe(404);
        expect(deniedResponse.text).toBe(missingResponse.text);
        expect(deniedResponse.headers["cache-control"]).toBe("private, no-store");
    });

    test("does not serve other methods through the photo route", async () => {
        const { app, authorizePhoto } = createTestApp();
        const response = await request(app).post(photoUrl);

        expect(response.status).toBe(404);
        expect(authorizePhoto).not.toHaveBeenCalled();
    });
});
