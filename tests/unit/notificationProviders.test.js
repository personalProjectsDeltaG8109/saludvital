import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { sendSms } from "../../src/modules/patient/services/smsService.js";
import {
    sendResendEmail,
    sendWhatsAppIdentityCode,
} from "../../src/modules/patient/services/resendEmailService.js";

const environmentKeys = [
    "INALAMBRIA_API_KEY",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "RESEND_FROM_NAME",
    "RESEND_CONFIRMATION_SUBJECT",
    "RESEND_CONFIRMATION_HTML",
];
const originalEnvironment = Object.fromEntries(
    environmentKeys.map((key) => [key, process.env[key]]),
);
const originalFetch = global.fetch;

afterEach(() => {
    environmentKeys.forEach((key) => {
        if (originalEnvironment[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnvironment[key];
    });
    global.fetch = originalFetch;
});

describe("independent notification providers", () => {
    test("sends Colombian SMS through Inalambria Express", async () => {
        process.env.INALAMBRIA_API_KEY = "test-sms-key";
        global.fetch = jest
            .fn()
            .mockResolvedValue({ ok: true, json: async () => ({ jobId: "job-1" }) });
        await expect(sendSms({ to: "+573137498332", body: "Hola" })).resolves.toMatchObject({
            id: "job-1",
            status: "accepted",
        });
        expect(global.fetch.mock.calls[0][0]).toContain("inalambria.express");
        expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer test-sms-key");
    });

    test("uses Inalambria error categories to avoid retrying permanent configuration failures", async () => {
        process.env.INALAMBRIA_API_KEY = "test-sms-key";
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => ({ data: { errorCode: "CONFIGURATION_ERROR" } }),
        });

        await expect(sendSms({ to: "+573137498332", body: "Hola" })).rejects.toMatchObject({
            retryable: false,
        });
    });

    test("retries Inalambria errors documented as transient", async () => {
        process.env.INALAMBRIA_API_KEY = "test-sms-key";
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 400,
            json: async () => ({ data: { errorCode: "FRAUD_VALIDATION_ERROR" } }),
        });

        await expect(sendSms({ to: "+573137498332", body: "Hola" })).rejects.toMatchObject({
            retryable: true,
            deliveryOutcome: "rejected",
        });
    });

    test("classifies an Inalambria transport timeout as an uncertain SMS outcome", async () => {
        process.env.INALAMBRIA_API_KEY = "test-sms-key";
        global.fetch = jest.fn().mockRejectedValue(new Error("socket closed"));

        await expect(sendSms({ to: "+573137498332", body: "Hola" })).rejects.toMatchObject({
            retryable: false,
            deliveryOutcome: "unknown",
        });
    });

    test("sends transactional email through Resend", async () => {
        process.env.RESEND_API_KEY = "test-resend-key";
        process.env.RESEND_FROM_EMAIL = "alerts@example.test";
        global.fetch = jest
            .fn()
            .mockResolvedValue({ ok: true, json: async () => ({ id: "email-1" }) });
        await expect(
            sendResendEmail({
                to: "patient@example.test",
                eventType: "appointment_reminder",
                body: "Cita <mañana>",
            }),
        ).resolves.toMatchObject({ id: "email-1", status: "accepted" });
        const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(global.fetch.mock.calls[0][0]).toBe("https://api.resend.com/emails");
        expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer test-resend-key");
        expect(requestBody.html).toContain("&lt;mañana&gt;");
    });

    test("sends Resend notifications with their stable idempotency key", async () => {
        process.env.RESEND_API_KEY = "test-resend-key";
        process.env.RESEND_FROM_EMAIL = "alerts@example.test";
        global.fetch = jest
            .fn()
            .mockResolvedValue({ ok: true, json: async () => ({ id: "email-3" }) });

        await sendResendEmail({
            to: "patient@example.test",
            eventType: "appointment_reminder",
            body: "Recordatorio de cita.",
            idempotencyKey: "notification-418",
        });

        expect(global.fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe("notification-418");
    });

    test("classifies a Resend timeout as uncertain instead of retryable", async () => {
        process.env.RESEND_API_KEY = "test-resend-key";
        process.env.RESEND_FROM_EMAIL = "alerts@example.test";
        global.fetch = jest.fn().mockRejectedValue(new Error("socket closed"));

        await expect(
            sendResendEmail({
                to: "patient@example.test",
                eventType: "appointment_reminder",
                body: "Recordatorio de cita.",
            }),
        ).rejects.toMatchObject({ retryable: false, deliveryOutcome: "unknown" });
    });

    test("treats an explicit Resend rate limit as a definite retryable rejection", async () => {
        process.env.RESEND_API_KEY = "test-resend-key";
        process.env.RESEND_FROM_EMAIL = "alerts@example.test";
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 429,
            json: async () => ({}),
        });

        await expect(
            sendResendEmail({
                to: "patient@example.test",
                eventType: "appointment_reminder",
                body: "Recordatorio de cita.",
            }),
        ).rejects.toMatchObject({ retryable: true, deliveryOutcome: "rejected" });
    });

    test("sends an appointment confirmation through the existing Resend adapter", async () => {
        process.env.RESEND_API_KEY = "test-resend-key";
        process.env.RESEND_FROM_EMAIL = "alerts@example.test";
        global.fetch = jest
            .fn()
            .mockResolvedValue({ ok: true, json: async () => ({ id: "email-confirmation" }) });

        await expect(
            sendResendEmail({
                to: "patient@example.test",
                eventType: "appointment_confirmation",
                body: "Tu cita quedó confirmada para mañana.",
            }),
        ).resolves.toMatchObject({ id: "email-confirmation", status: "accepted" });

        const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(requestBody.subject).toBe("Confirmación de tu cita en SaludVital");
        expect(requestBody.html).toContain("Tu cita quedó confirmada para mañana.");
    });

    test("sends an identity code without exposing it in a response or error", async () => {
        process.env.RESEND_API_KEY = "test-resend-key";
        process.env.RESEND_FROM_EMAIL = "alerts@example.test";
        global.fetch = jest
            .fn()
            .mockResolvedValue({ ok: true, json: async () => ({ id: "email-2" }) });
        await expect(
            sendWhatsAppIdentityCode({ to: "patient@example.test", code: "348291" }),
        ).resolves.toEqual({ id: "email-2", status: "accepted" });
        expect(global.fetch.mock.calls[0][1].body).toContain("348291");
    });
});
