import request from "supertest";
import app from "../../app.js";

describe("Doctor agenda routes", () => {
    test.each(["/doctor/agenda", "/api/doctor/agenda"])(
        "%s requires an authenticated doctor",
        async (path) => {
            const response = await request(app).get(path).redirects(0);
            expect(response.status).toBe(303);
            expect(response.headers.location).toBe("/login");
        },
    );
});
