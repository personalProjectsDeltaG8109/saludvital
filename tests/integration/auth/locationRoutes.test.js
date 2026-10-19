import { describe, expect, test } from "@jest/globals";
import request from "supertest";
import app from "../../../app.js";

// Verify the public location endpoints used by patient registration.
describe("Location API", () => {
    test("returns the department catalog", async () => {
        const response = await request(app).get("/api/locations/departments");

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveLength(33);
        expect(response.body.data).toContainEqual({
            code: "66",
            name: "RISARALDA",
        });
    });

    test("returns only municipalities for the requested department", async () => {
        const response = await request(app).get("/api/locations/departments/66/municipalities");

        expect(response.status).toBe(200);
        expect(response.body.data).toContainEqual({
            code: "66001",
            name: "PEREIRA",
        });
        expect(response.body.data).toContainEqual({
            code: "66682",
            name: "SANTA ROSA DE CABAL",
        });
        expect(response.body.data).toHaveLength(14);
    });

    test("rejects an unknown department", async () => {
        const response = await request(app).get("/api/locations/departments/XX/municipalities");

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty("error");
    });

    test("does not return municipalities from another department", async () => {
        const response = await request(app).get("/api/locations/departments/66/municipalities");

        expect(response.status).toBe(200);
        expect(response.body.data).not.toContainEqual({
            code: "05001",
            name: "MEDELLÍN",
        });
    });
});
