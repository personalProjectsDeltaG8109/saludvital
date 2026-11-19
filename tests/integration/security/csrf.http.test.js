import request from "supertest";
import app from "../../../app.js";

describe("authenticated state-changing request origin checks", () => {
    test("rejects a cross-origin API mutation before authentication handling", async () => {
        const response = await request(app)
            .patch("/api/patient/notifications/read")
            .set("Cookie", "token=session-token")
            .set("Origin", "https://evil.example")
            .send({ notificationId: 1 });

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ error: "Solicitud no autorizada." });
    });

    test("rejects a cross-origin browser form request with a token cookie", async () => {
        const response = await request(app)
            .post("/session/activity")
            .set("Cookie", "token=session-token")
            .set("Referer", "https://evil.example/account")
            .type("form")
            .send({});

        expect(response.status).toBe(403);
        expect(response.text).toBe("Solicitud no autorizada.");
    });

    test("continues to reject a cross-origin login form when a session cookie exists", async () => {
        const response = await request(app)
            .post("/login")
            .set("Cookie", "token=session-token")
            .set("Origin", "https://evil.example")
            .type("form")
            .send({ email: "patient@example.test", password: "not-a-real-password" });

        expect(response.status).toBe(403);
        expect(response.text).toBe("Solicitud no autorizada.");
    });

    test("rejects a cross-origin logout request when a session cookie exists", async () => {
        const response = await request(app)
            .post("/logout")
            .set("Cookie", "token=session-token")
            .set("Origin", "https://evil.example")
            .type("form")
            .send({});

        expect(response.status).toBe(403);
        expect(response.text).toBe("Solicitud no autorizada.");
    });

    test("allows a same-origin request to continue to normal authentication", async () => {
        const response = await request(app)
            .post("/session/activity")
            .set("Host", "127.0.0.1")
            .set("Origin", "http://127.0.0.1")
            .set("Cookie", "token=session-token")
            .type("form")
            .send({});

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("does not apply the authenticated-cookie check to public registration", async () => {
        const response = await request(app)
            .post("/register")
            .set("Origin", "https://evil.example")
            .type("form")
            .send({});

        expect(response.status).not.toBe(403);
    });
});
