import express from "express";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { errorHandler } from "../../src/middleware/errorHandler.js";

const internalDetail = "internal-detail-sentinel-not-for-the-browser";

function createErrorApplication() {
    const app = express();
    app.set("view engine", "pug");
    app.set("views", path.resolve("views"));
    app.all("/failure", (_req, _res, next) => next(new Error(internalDetail)));
    app.get("/unsafe-retry", (req, _res, next) => {
        req.originalUrl = req.query.destination;
        next(new Error(internalDetail));
    });
    app.use(errorHandler);
    return app;
}

describe("server-error page recovery", () => {
    beforeEach(() => {
        jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("returns an uncached 500 page without exposing diagnostic details", async () => {
        const response = await request(createErrorApplication()).get("/failure");

        expect(response.status).toBe(500);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.text).toContain("Error del servidor");
        expect(response.text).not.toContain(internalDetail);
        expect(response.text).not.toContain("Error: " + internalDetail);
    });

    test("retries a failed GET through the same local path and escaped query", async () => {
        const response = await request(createErrorApplication()).get(
            "/failure?context=readable&filter=all",
        );

        expect(response.text).toContain('href="/failure?context=readable&amp;filter=all"');
        expect(response.text).toContain("Intentar de nuevo");
        expect(response.text).toContain('href="/"');
    });

    test("offers login recovery after a failed POST instead of resubmitting it", async () => {
        const response = await request(createErrorApplication())
            .post("/failure")
            .type("form")
            .send({ example: "synthetic-form-value" });

        expect(response.status).toBe(500);
        expect(response.text).toContain('href="/login"');
        expect(response.text).toContain("Volver a iniciar sesión");
        expect(response.text).not.toContain('href="/failure"');
        expect(response.text).not.toContain("synthetic-form-value");
        expect(response.text).not.toContain("<form");
    });

    test.each([
        "//example.test/path",
        "/\\example.test/path",
        "https://example.test/path",
        "javascript:alert(1)",
        "/\n/example.test/path",
    ])("does not turn an unsafe recovery destination into a link: %s", async (destination) => {
        const response = await request(createErrorApplication())
            .get("/unsafe-retry")
            .query({ destination });

        expect(response.status).toBe(500);
        expect(response.text).toContain('href="/login"');
        expect(response.text).not.toContain("example.test");
        expect(response.text).not.toContain("javascript:");
    });

    test("delegates errors after response headers have been sent", () => {
        const error = new Error(internalDetail);
        const next = jest.fn();

        errorHandler(error, {}, { headersSent: true }, next);

        expect(next).toHaveBeenCalledWith(error);
        expect(console.error).not.toHaveBeenCalled();
    });
});
