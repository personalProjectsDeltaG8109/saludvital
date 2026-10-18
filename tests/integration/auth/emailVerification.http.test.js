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
        verifyEmail.mockRejectedValue(new Error("Controlled verification failure"));

        const response = await request(app)
            .get("/verify-email")
            .query({ token: "c".repeat(64) });

        expect(response.status).toBe(500);
        expect(response.text).not.toContain("Controlled verification failure");
    });
});
