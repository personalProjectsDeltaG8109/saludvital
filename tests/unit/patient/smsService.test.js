import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

const { sendSms } = await import("../../../src/modules/patient/services/smsService.js");

describe("Inalambria Express SMS service", () => {
    const originalApiKey = process.env.INALAMBRIA_API_KEY;
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        process.env.INALAMBRIA_API_KEY = "test-inalambria-key";
        globalThis.fetch = jest.fn();
    });

    afterEach(() => {
        if (originalApiKey === undefined) delete process.env.INALAMBRIA_API_KEY;
        else process.env.INALAMBRIA_API_KEY = originalApiKey;
        globalThis.fetch = originalFetch;
    });

    test("sends the Colombian recipient and message through the authenticated API", async () => {
        globalThis.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ jobId: "job-123" }),
        });

        await expect(
            sendSms({ to: "+573001234567", body: "Su cita está confirmada." }),
        ).resolves.toEqual({
            id: "job-123",
            status: "accepted",
        });

        expect(globalThis.fetch).toHaveBeenCalledWith(
            "https://api.inalambria.express/v1/messages/send",
            expect.objectContaining({
                method: "POST",
                headers: {
                    Authorization: "Bearer test-inalambria-key",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    recipients: ["+573001234567"],
                    content: "Su cita está confirmada.",
                    async: true,
                }),
            }),
        );
    });

    test("rejects invalid Colombian phone numbers before contacting the provider", async () => {
        await expect(sendSms({ to: "3001234567", body: "Mensaje" })).rejects.toMatchObject({
            message: "El destinatario debe ser un número celular válido de Colombia.",
        });

        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    test("reports missing credentials without making a provider request", async () => {
        delete process.env.INALAMBRIA_API_KEY;

        await expect(sendSms({ to: "+573001234567", body: "Mensaje" })).rejects.toMatchObject({
            message: "La integración de SMS no está configurada.",
        });

        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    test("does not expose provider response details when the API rejects a message", async () => {
        globalThis.fetch.mockResolvedValue({
            ok: false,
            status: 401,
            json: async () => ({
                errorCode: "API_KEY_INVALID",
                accessToken: "private-provider-data",
            }),
        });

        let deliveryError;
        try {
            await sendSms({ to: "+573001234567", body: "Mensaje" });
        } catch (error) {
            deliveryError = error;
        }

        expect(deliveryError).toMatchObject({
            message: "Inalambria Express rechazó el SMS (HTTP 401).",
            retryable: false,
            deliveryOutcome: "rejected",
        });
        expect(deliveryError.message).not.toContain("private-provider-data");
    });

    test("marks network failures as uncertain without exposing the original error", async () => {
        globalThis.fetch.mockRejectedValue(new Error("secret network diagnostic"));

        await expect(sendSms({ to: "+573001234567", body: "Mensaje" })).rejects.toMatchObject({
            message: "Inalambria no confirmó el resultado del SMS.",
            retryable: false,
            deliveryOutcome: "unknown",
        });
    });
});
