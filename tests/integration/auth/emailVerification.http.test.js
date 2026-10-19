import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import request from "supertest";

// Mock only the verification service; Express and the real controller remain active.
jest.unstable_mockModule("../../../src/modules/auth/services/emailVerificationService.js", () => ({
    verifyEmail: jest.fn(),
}));

const { verifyEmail } =
    await import("../../../src/modules/auth/services/emailVerificationService.js");
const { default: app } = await import("../../../app.js");

describe("Email verification HTTP endpoint", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("renders success when the token is verified", async () => {
        verifyEmail.mockResolvedValue({ verified: true });

        const response = await request(app)
            .get("/verify-email")
            .query({ token: "a".repeat(64) });

        expect(response.status).toBe(200);
        expect(response.text).toContain("¡Tu correo está verificado!");
        expect(verifyEmail).toHaveBeenCalledWith("a".repeat(64));
    });

    test("renders an invalid result when the token is rejected", async () => {
        verifyEmail.mockResolvedValue({
            verified: false,
            reason: "invalid_or_expired",
        });

        const response = await request(app)
            .get("/verify-email")
            .query({ token: "b".repeat(64) });

        expect(response.status).toBe(400);
        expect(verifyEmail).toHaveBeenCalledWith("b".repeat(64));
    });

    test("handles a missing token without passing undefined to the service", async () => {
        verifyEmail.mockResolvedValue({
            verified: false,
            reason: "invalid",
        });

        const response = await request(app).get("/verify-email");

        expect(response.status).toBe(400);
        expect(verifyEmail).toHaveBeenCalledWith("");
    });

    test("forwards unexpected service errors to Express error handling", async () => {
        // Simulate an unexpected failure from the email verification service.
        verifyEmail.mockRejectedValue(new Error("Controlled verification failure"));

        // Capture the expected error log to keep the test output clean.
        const errorLogSpy = jest.spyOn(console, "error").mockImplementation(() => {});

        try {
            const response = await request(app)
                .get("/verify-email")
                .query({ token: "c".repeat(64) });

            // Verify that the application handles the failure safely.
            expect(response.status).toBe(500);
            expect(response.text).not.toContain("Controlled verification failure");

            // Verify that the middleware logs the unexpected error.
            expect(errorLogSpy).toHaveBeenCalledWith(
                "Unhandled application error.",
                expect.objectContaining({
                    method: "GET",
                    path: "/verify-email",
                    error: "Controlled verification failure",
                }),
            );
        } finally {
            // Restore console.error even if an assertion fails.
            errorLogSpy.mockRestore();
        }
    });
});
