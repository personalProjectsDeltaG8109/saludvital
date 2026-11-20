import request from "supertest";
import app from "../../../app.js";

const railwayPublicDomain = process.env.RAILWAY_PUBLIC_DOMAIN;

describe("Authentication rate limits behind the Railway edge", () => {
    beforeAll(() => {
        app.enable("view cache");
        process.env.RAILWAY_PUBLIC_DOMAIN = "saludvital-test.up.railway.app";
    });

    afterAll(() => {
        if (railwayPublicDomain === undefined) {
            delete process.env.RAILWAY_PUBLIC_DOMAIN;
        } else {
            process.env.RAILWAY_PUBLIC_DOMAIN = railwayPublicDomain;
        }
    });

    test("uses valid Railway client IPs as separate rate-limit keys", async () => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const response = await request(app)
                .post("/register")
                .set("X-Railway-Edge", "test-edge")
                .set("X-Real-IP", "203.0.113.10")
                .type("form")
                .send({});

            expect(response.status).toBe(400);
        }

        const limitedClient = await request(app)
            .post("/register")
            .set("X-Railway-Edge", "test-edge")
            .set("X-Real-IP", "203.0.113.10")
            .type("form")
            .send({});
        const separateClient = await request(app)
            .post("/register")
            .set("X-Railway-Edge", "test-edge")
            .set("X-Real-IP", "203.0.113.11")
            .type("form")
            .send({});

        expect(limitedClient.status).toBe(302);
        expect(separateClient.status).toBe(400);
    });

    test("ignores untrusted forwarding headers and falls back for malformed edge IPs", async () => {
        for (let attempt = 0; attempt < 6; attempt += 1) {
            const response = await request(app)
                .post("/register")
                .set("X-Railway-Edge", "test-edge")
                .set("X-Real-IP", `not-an-ip-${attempt}`)
                .type("form")
                .send({});

            expect(response.status).toBe(attempt < 5 ? 400 : 302);
        }

        for (let attempt = 0; attempt < 6; attempt += 1) {
            const response = await request(app)
                .post("/reset-password")
                .set("X-Real-IP", `198.51.100.${attempt + 1}`)
                .set("X-Forwarded-For", `198.51.100.${attempt + 1}`)
                .type("form")
                .send({
                    token: "invalid-token",
                    password: "SecurePassword1!",
                    password_confirmation: "SecurePassword1!",
                });

            expect(response.status).toBe(attempt < 5 ? 400 : 429);
        }
    });
});
