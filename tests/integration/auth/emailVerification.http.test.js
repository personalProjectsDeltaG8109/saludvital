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
        expect(response.text).toContain("¡Tu cuenta ha sido confirmada con éxito!");
        expect(response.text).toContain(
            "Ahora puedes iniciar sesión y comenzar a gestionar tus citas médicas en SaludVital.",
        );
        expect(response.text).toContain("nuestra prioridad.");
        expect(response.text).toContain(
            "Accede a tu cuenta, gestiona tus citas médicas o solicita una cita fácilmente por WhatsApp.",
        );
        expect(response.text).toContain("de forma rápida y sencilla.");
        expect(response.text).toContain('data-image-slot="account-confirmed"');
        expect(response.text).toContain("/brand/login/recovery-link-sent.webp");
        expect(response.text).toContain('href="/login"');
        expect(response.text).toContain("Tu salud,");
        expect(response.text).toContain("Tu salud siempre");
        expect(response.text).not.toContain("a".repeat(64));
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
        expect(response.text).toContain("Este enlace ya no está vigente");
        expect(response.text).toContain("Enlace caducado o ya utilizado");
        expect(response.text).toContain("Tu salud,");
        expect(response.text).toContain("Tu salud siempre");
        expect(response.text).not.toContain("Verificación pendiente");
        expect(response.text).not.toContain("¡Tu cuenta ha sido confirmada con éxito!");
        expect(response.text).not.toContain("/brand/login/recovery-link-sent.webp");
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

            // Diagnostics must identify the failure without logging its raw message.
            expect(errorLogSpy).toHaveBeenCalledWith("Application request failed.", {
                method: "GET",
                scope: "page",
                status: 500,
                category: "UNEXPECTED_ERROR",
            });
            expect(JSON.stringify(errorLogSpy.mock.calls)).not.toContain(
                "Controlled verification failure",
            );
        } finally {
            // Restore console.error even if an assertion fails.
            errorLogSpy.mockRestore();
        }
    });
});
