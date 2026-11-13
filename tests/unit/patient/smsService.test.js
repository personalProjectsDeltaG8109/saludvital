import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

const { sendSms } = await import("../../../src/modules/patient/services/smsService.js");

describe("Inalambria REST SMS service", () => {
    const environmentKeys = ["INALAMBRIA_REST_USERNAME", "INALAMBRIA_REST_PASSWORD"];
    const originalEnvironment = Object.fromEntries(
        environmentKeys.map((key) => [key, process.env[key]]),
    );
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        process.env.INALAMBRIA_REST_USERNAME = "test-user";
        process.env.INALAMBRIA_REST_PASSWORD = "test-password";
        globalThis.fetch = jest.fn();
    });

    afterEach(() => {
        for (const key of environmentKeys) {
            if (originalEnvironment[key] === undefined) delete process.env[key];
            else process.env[key] = originalEnvironment[key];
        }
        globalThis.fetch = originalFetch;
    });

    test("sends a Colombian SMS and includes its internal callback reference", async () => {
        globalThis.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                TransactionNumber: "1234567890123456789012345678",
                Status: 0,
            }),
        });

        await expect(
            sendSms({
                to: "+573001234567",
                body: "Su cita está confirmada.",
                notificationId: 418,
            }),
        ).resolves.toEqual({
            id: "1234567890123456789012345678",
            status: "accepted",
        });

        expect(globalThis.fetch).toHaveBeenCalledWith(
            "https://rest.inalambria.com/mtmessage",
            expect.objectContaining({
                method: "POST",
                headers: {
                    Authorization: `Basic ${Buffer.from("test-user:test-password").toString("base64")}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    Type: 1,
                    MessageText: "Su cita está confirmada.",
                    Devices: "573001234567",
                    CustomMessageId: "418",
                }),
            }),
        );
    });

    test("rejects invalid Colombian phone numbers before contacting the provider", async () => {
        await expect(sendSms({ to: "3001234567", body: "Mensaje" })).rejects.toThrow(
            "El destinatario debe ser un número celular válido de Colombia.",
        );

        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    test("rejects SMS content above the provider recommended limit", async () => {
        await expect(sendSms({ to: "+573001234567", body: "x".repeat(501) })).rejects.toMatchObject(
            { message: "El mensaje SMS debe tener entre 1 y 500 caracteres." },
        );

        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    test("reports missing credentials without making a provider request", async () => {
        delete process.env.INALAMBRIA_REST_PASSWORD;

        await expect(sendSms({ to: "+573001234567", body: "Mensaje" })).rejects.toThrow(
            "La integración de SMS no está configurada.",
        );

        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    test("does not expose provider response details when the API rejects a message", async () => {
        globalThis.fetch.mockResolvedValue({
            ok: false,
            status: 401,
            json: async () => ({ MessageText: "private provider data" }),
        });

        const error = await sendSms({ to: "+573001234567", body: "Mensaje" }).catch(
            (rejection) => rejection,
        );

        expect(error.message).toBe("Inalambria rechazó el SMS (HTTP 401).");
        expect(error).toMatchObject({
            retryable: false,
            deliveryOutcome: "rejected",
        });
    });

    test("treats a provider validation rejection as a definite failure", async () => {
        globalThis.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ Status: 1, MessageText: "private provider data" }),
        });

        const error = await sendSms({ to: "+573001234567", body: "Mensaje" }).catch(
            (rejection) => rejection,
        );

        expect(error.message).toBe("Inalambria rechazó el SMS.");
        expect(error).toMatchObject({
            retryable: false,
            deliveryOutcome: "rejected",
        });
    });

    test("marks network failures as uncertain without exposing the original error", async () => {
        globalThis.fetch.mockRejectedValue(new Error("private network diagnostic"));

        const error = await sendSms({ to: "+573001234567", body: "Mensaje" }).catch(
            (rejection) => rejection,
        );

        expect(error.message).toBe("Inalambria no confirmó el resultado del SMS.");
        expect(error).toMatchObject({
            retryable: false,
            deliveryOutcome: "unknown",
        });
    });

    test("requires the provider transaction reference to reconcile delivery", async () => {
        globalThis.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ Status: 0 }),
        });

        await expect(sendSms({ to: "+573001234567", body: "Mensaje" })).rejects.toMatchObject({
            deliveryOutcome: "unknown",
        });
    });
});
