import express from "express";
import path from "node:path";
import request from "supertest";
import { describe, expect, test } from "@jest/globals";
import { requireRole } from "../../src/middleware/authenticateToken.js";

const protectedContent = "protected-patient-content-sentinel";

function createApplication(role, allowedRole = "Patient") {
    const app = express();
    app.set("view engine", "pug");
    app.set("views", path.resolve("views"));
    // Supply the identity normally established by authenticateToken without using a database.
    app.use((req, _res, next) => {
        if (role !== null) req.auth = { userId: "12", role };
        next();
    });
    app.get(["/restricted", "/api/restricted"], requireRole(allowedRole), (_req, res) => {
        res.send(protectedContent);
    });
    return app;
}

describe("access-denied page and role enforcement", () => {
    test.each([
        ["Patient", "Administrator", "/patient/dashboard"],
        ["Doctor", "Patient", "/doctor/dashboard"],
        ["Administrator", "Patient", "/admin/dashboard"],
    ])("renders a 403 with recovery for the verified %s role", async (role, allowedRole, href) => {
        const response = await request(createApplication(role, allowedRole))
            .get("/restricted")
            .accept("html");

        expect(response.status).toBe(403);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.text).toContain("Acceso denegado");
        expect(response.text).toContain(`href="${href}"`);
        expect(response.text).toContain('href="/"');
        expect(response.text).not.toContain(protectedContent);
    });

    test("ignores client-supplied role and redirect values when selecting recovery links", async () => {
        const response = await request(createApplication("Doctor"))
            .get("/restricted")
            .query({ role: "Administrator", redirect: "https://example.test" })
            .accept("html");

        expect(response.status).toBe(403);
        expect(response.text).toContain('href="/doctor/dashboard"');
        expect(response.text).not.toContain('href="/admin/dashboard"');
        expect(response.text).not.toContain("example.test");
    });

    test.each([null, "UnknownRole", "__proto__", "toString"])(
        "omits dashboard recovery without a recognized identity: %s",
        async (role) => {
            const response = await request(createApplication(role))
                .get("/restricted")
                .accept("html");

            expect(response.status).toBe(403);
            expect(response.text).toContain("Acceso denegado");
            expect(response.text).not.toContain("Ir al dashboard");
            expect(response.text).not.toContain(protectedContent);
        },
    );

    test("preserves API denial responses even when HTML is requested", async () => {
        const response = await request(createApplication("Doctor"))
            .get("/api/restricted")
            .accept("html");

        expect(response.status).toBe(403);
        expect(response.text).toBe("Access denied.");
    });

    test.each(["json", "text/plain"])(
        "preserves non-HTML denial responses for %s",
        async (accept) => {
            const response = await request(createApplication("Doctor"))
                .get("/restricted")
                .accept(accept);

            expect(response.status).toBe(403);
            expect(response.text).toBe("Access denied.");
        },
    );

    test("continues allowing an authorized role to reach the protected handler", async () => {
        const response = await request(createApplication("Patient"))
            .get("/restricted")
            .accept("html");

        expect(response.status).toBe(200);
        expect(response.text).toBe(protectedContent);
    });
});
