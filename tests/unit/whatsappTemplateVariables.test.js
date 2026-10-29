import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import {
    sendWhatsApp,
    sendWhatsAppReply,
} from "../../src/modules/patient/services/whatsappService.js";

const environmentKeys = [
    "META_WHATSAPP_ACCESS_TOKEN",
    "META_WHATSAPP_PHONE_NUMBER_ID",
    "META_WHATSAPP_API_VERSION",
    "META_WHATSAPP_TEMPLATE_LANGUAGE",
    "META_WHATSAPP_REMINDER_TEMPLATE_NAME",
];
const originalEnvironment = Object.fromEntries(
    environmentKeys.map((key) => [key, process.env[key]]),
);
const originalFetch = global.fetch;

beforeEach(() => {
    process.env.META_WHATSAPP_ACCESS_TOKEN = "test-access-token";
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = "123456789";
    process.env.META_WHATSAPP_API_VERSION = "v25.0";
    process.env.META_WHATSAPP_TEMPLATE_LANGUAGE = "es_CO";
    process.env.META_WHATSAPP_REMINDER_TEMPLATE_NAME = "appointment_reminder";
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: "wamid.test" }] }),
    });
});

afterEach(() => {
    environmentKeys.forEach((key) => {
        if (originalEnvironment[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnvironment[key];
    });
    global.fetch = originalFetch;
});

describe("Meta WhatsApp Cloud API", () => {
    test("sends approved notification templates with escaped runtime values", async () => {
        await sendWhatsApp({
            to: "+573001234567",
            eventType: "appointment_reminder",
            contentVariables: ["22/04/2025", "10:30 a. m."],
        });

        const [url, request] = global.fetch.mock.calls[0];
        expect(url).toBe("https://graph.facebook.com/v25.0/123456789/messages");
        expect(request.headers.Authorization).toBe("Bearer test-access-token");
        expect(JSON.parse(request.body).template.components[0].parameters).toEqual([
            { type: "text", text: "22/04/2025" },
            { type: "text", text: "10:30 a. m." },
        ]);
    });

    test("sends a safe interactive reply and returns the provider message id", async () => {
        await expect(
            sendWhatsAppReply({
                to: "+573001234567",
                text: "Elige una opción",
                options: [{ id: "menu:1", title: "Solicitar cita" }],
            }),
        ).resolves.toEqual({ id: "wamid.test", status: "accepted" });
        const payload = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(payload.interactive.type).toBe("list");
        expect(payload.interactive.action.sections[0].rows[0].id).toBe("menu:1");
    });

    test("rejects invalid recipients and incomplete template values before sending", async () => {
        await expect(
            sendWhatsApp({ to: "not-a-number", eventType: "appointment_reminder" }),
        ).rejects.toThrow("formato internacional válido");
        await expect(
            sendWhatsApp({
                to: "+573001234567",
                eventType: "appointment_reminder",
                contentVariables: [""],
            }),
        ).rejects.toThrow("variables de la plantilla");
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test("uses Meta's transient error signal for queue retry decisions", async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 400,
            json: async () => ({ error: { is_transient: true } }),
        });

        await expect(
            sendWhatsApp({
                to: "+573001234567",
                eventType: "appointment_reminder",
                contentVariables: ["fecha", "hora"],
            }),
        ).rejects.toMatchObject({ retryable: true });
    });
});
