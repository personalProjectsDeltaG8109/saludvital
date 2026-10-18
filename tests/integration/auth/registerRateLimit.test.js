import express from "express";
import request from "supertest";
import rateLimit from "express-rate-limit";

// Create an isolated Express application to test registration throttling.
describe("Patient registration rate limiter", () => {
    let app;

    beforeEach(() => {
        app = express();

        // Apply the same registration limit without sharing production state.
        const registerLimiter = rateLimit({
            windowMs: 15 * 60 * 1000,
            limit: 5,
            standardHeaders: true,
            legacyHeaders: false,
            handler: (req, res) => {
                return res.redirect(
                    "/register?error=" +
                        encodeURIComponent("Demasiados intentos de registro. Inténtalo más tarde."),
                );
            },
        });

        app.post("/register", registerLimiter, (req, res) => {
            return res.sendStatus(400);
        });
    });

    test("allows five requests before activating the limit", async () => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const response = await request(app).post("/register");

            // The route responds with 400 because this test does not create accounts.
            expect(response.status).toBe(400);
        }
    });

    test("redirects the sixth request with the configured error message", async () => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
            await request(app).post("/register");
        }

        const response = await request(app).post("/register");

        expect(response.status).toBe(302);
        expect(response.headers.location).toContain("/register?error=");
        expect(decodeURIComponent(response.headers.location)).toContain(
            "Demasiados intentos de registro. Inténtalo más tarde.",
        );
    });
});
