import request from "supertest";
import app from "../../app.js";

describe("Doctor agenda routes", () => {
    test.each([
        "/doctor/agenda",
        "/doctor/notifications",
        "/api/doctor/agenda",
        "/api/doctor/notifications",
        "/api/doctor/notifications/unread-count",
        "/api/doctor/consultations/active",
    ])("%s requires an authenticated doctor", async (path) => {
        const response = await request(app).get(path).redirects(0);
        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("doctor notification read endpoint requires an authenticated doctor", async () => {
        const response = await request(app).post("/api/doctor/notifications/21/read").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("mark-all doctor notification endpoint requires an authenticated doctor", async () => {
        const response = await request(app).post("/api/doctor/notifications/read-all").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });
});
