import request from "supertest";
import app from "../../app.js";

describe("SaludVital application", () => {
    test("GET / redirects to the login page", async () => {
        const response = await request(app).get("/");

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("GET /login renders the login page", async () => {
        const response = await request(app).get("/login");

        expect(response.status).toBe(200);
        expect(response.text).toContain("SaludVital");
    });

    test("GET /health returns 404 when no health route is configured", async () => {
        const response = await request(app).get("/health");

        expect(response.status).toBe(404);
    });

    test("unknown routes return 404", async () => {
        const response = await request(app).get("/route-that-does-not-exist");

        expect(response.status).toBe(404);
    });
});
