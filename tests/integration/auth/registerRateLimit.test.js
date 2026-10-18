import request from "supertest";
import app from "../../../app.js";

describe("Patient registration rate limiter", () => {
    // Use the real application and registration route without creating accounts.
    test("allows five requests and redirects the sixth request", async () => {
        // The first five requests reach the controller and fail consent validation.
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const response = await request(app).post("/register").type("form").send({});

            expect(response.status).toBe(400);
            expect(response.text).toContain("autorizar el tratamiento");
        }

        // The sixth request must be rejected by the actual registration limiter.
        const response = await request(app).post("/register").type("form").send({});

        expect(response.status).toBe(302);
        expect(response.headers.location).toContain("/register?error=");
        expect(decodeURIComponent(response.headers.location)).toContain(
            "Demasiados intentos de registro. Inténtalo más tarde.",
        );
    });
});
