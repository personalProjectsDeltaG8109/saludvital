import request from "supertest";
import app from "../../../app.js";

describe("Password recovery HTTP routes", () => {
    // Reject malformed tokens without accessing or modifying a user account.
    test("POST /reset-password rejects a malformed token securely", async () => {
        const response = await request(app).post("/reset-password").type("form").send({
            token: "invalid-token",
            password: "SecurePassword1!",
            password_confirmation: "SecurePassword1!",
        });

        expect(response.status).toBe(400);
        expect(response.text).toContain("El enlace de recuperación no es válido o ha vencido.");
        expect(response.headers["referrer-policy"]).toBe("no-referrer");
        expect(response.headers["cache-control"]).toContain("no-store");
    });

    // Ensure the reset page protects the token supplied in its URL.
    test("GET /reset-password sets secure response headers", async () => {
        const response = await request(app)
            .get("/reset-password")
            .query({ token: "a".repeat(64) });

        expect(response.status).toBe(200);
        expect(response.headers["referrer-policy"]).toBe("no-referrer");
        expect(response.headers["cache-control"]).toContain("no-store");
    });
});
