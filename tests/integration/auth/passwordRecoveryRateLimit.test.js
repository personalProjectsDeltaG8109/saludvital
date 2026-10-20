import request from "supertest";
import app from "../../../app.js";

describe("Password recovery rate limiter", () => {
    // Verify the real limiter rejects excess recovery requests securely.
    test("returns 429 with secure headers after five requests", async () => {
        // The first five requests should reach the controller.
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const response = await request(app).post("/reset-password").type("form").send({
                token: "invalid-token",
                password: "SecurePassword1!",
                password_confirmation: "SecurePassword1!",
            });

            expect(response.status).toBe(400);
        }

        // The sixth request should be blocked by the actual rate limiter.
        const response = await request(app).post("/reset-password").type("form").send({
            token: "invalid-token",
            password: "SecurePassword1!",
            password_confirmation: "SecurePassword1!",
        });

        expect(response.status).toBe(429);
        expect(response.headers["referrer-policy"]).toBe("no-referrer");
        expect(response.headers["cache-control"]).toContain("no-store");
    });
});
