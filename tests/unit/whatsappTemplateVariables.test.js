import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

const createMessage = jest.fn();
jest.unstable_mockModule("../../src/modules/patient/services/twilioClient.js", () => ({
    createTwilioClient: () => ({ messages: { create: createMessage } }),
}));

const { sendWhatsApp } = await import("../../src/modules/patient/services/whatsappService.js");

const environmentKeys = [
    "TWILIO_WHATSAPP_FROM",
    "TWILIO_WHATSAPP_REMINDER_CONTENT_SID",
    "TWILIO_WHATSAPP_CONTENT_VARIABLES",
];
const originalEnvironment = Object.fromEntries(
    environmentKeys.map((key) => [key, process.env[key]]),
);

beforeEach(() => {
    createMessage.mockReset().mockResolvedValue({ sid: "SM_TEST", status: "queued" });
    process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155550100";
    process.env.TWILIO_WHATSAPP_REMINDER_CONTENT_SID = "HX_TEST";
    delete process.env.TWILIO_WHATSAPP_CONTENT_VARIABLES;
});

afterEach(() => {
    environmentKeys.forEach((key) => {
        if (originalEnvironment[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnvironment[key];
    });
});

describe("WhatsApp dynamic template variables", () => {
    test("sends the runtime values supplied for the notification", async () => {
        await sendWhatsApp({
            to: "+573001234567",
            eventType: "appointment_reminder",
            contentVariables: { 1: "22/04/2025", 2: "10:30 a. m." },
        });

        expect(createMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                contentSid: "HX_TEST",
                contentVariables: JSON.stringify({ 1: "22/04/2025", 2: "10:30 a. m." }),
            }),
        );
    });

    test("rejects malformed configured variables before calling Twilio", async () => {
        await expect(
            sendWhatsApp({
                to: "+573001234567",
                eventType: "appointment_reminder",
                contentVariables: "{invalid json",
            }),
        ).rejects.toThrow("TWILIO_WHATSAPP_CONTENT_VARIABLES must be valid JSON.");

        expect(createMessage).not.toHaveBeenCalled();
    });
});
