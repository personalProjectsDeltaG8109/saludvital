import request from "supertest";
import app from "../../app.js";

describe("Administrator profile photo routes", () => {
    test("rejects unauthenticated photo uploads", async () => {
        const response = await request(app)
            .post("/api/admin/profile/photo")
            .send({ photo: "data:image/png;base64,aW1hZ2U=" });

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("rejects unauthenticated photo removals", async () => {
        const response = await request(app).delete("/api/admin/profile/photo");

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });
});
