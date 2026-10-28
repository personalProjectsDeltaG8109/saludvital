import { afterEach, describe, expect, test } from "@jest/globals";
import { getAdminWhatsAppTemplateConfiguration } from "../../src/modules/admin/services/adminWhatsAppTemplateService.js";

const environmentKeys = [
    "TWILIO_WHATSAPP_REMINDER_CONTENT_SID",
    "TWILIO_WHATSAPP_CONTENT_SID",
    "TWILIO_WHATSAPP_RESCHEDULE_CONTENT_SID",
    "TWILIO_WHATSAPP_CANCELLATION_CONTENT_SID",
];
const originalEnvironment = Object.fromEntries(
    environmentKeys.map((key) => [key, process.env[key]]),
);

afterEach(() => {
    environmentKeys.forEach((key) => {
        if (originalEnvironment[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnvironment[key];
    });
});

describe("administrator WhatsApp template configuration", () => {
    test("reports supported application templates and their local configuration only", () => {
        process.env.TWILIO_WHATSAPP_REMINDER_CONTENT_SID = "HX_PRIVATE_REMINDER";
        delete process.env.TWILIO_WHATSAPP_CONTENT_SID;
        delete process.env.TWILIO_WHATSAPP_RESCHEDULE_CONTENT_SID;
        delete process.env.TWILIO_WHATSAPP_CANCELLATION_CONTENT_SID;

        const templates = getAdminWhatsAppTemplateConfiguration();

        expect(templates.map(({ eventType }) => eventType)).toEqual([
            "appointment_reminder",
            "appointment_reschedule",
            "appointment_cancellation",
        ]);
        expect(templates[0]).toMatchObject({
            name: "Recordatorio de cita",
            configured: true,
            configurationStatus: "Configured",
            providerStatus: "Unknown",
        });
        expect(templates[0]).not.toHaveProperty("content");
        expect(templates[0]).not.toHaveProperty("language");
        expect(templates.slice(1).every((template) => !template.configured)).toBe(true);
        expect(JSON.stringify(templates)).not.toContain("HX_PRIVATE_REMINDER");
        expect(JSON.stringify(templates)).not.toContain("Aprobada");
    });

    test("uses the reminder fallback identifier supported by the delivery service", () => {
        delete process.env.TWILIO_WHATSAPP_REMINDER_CONTENT_SID;
        process.env.TWILIO_WHATSAPP_CONTENT_SID = "HX_PRIVATE_FALLBACK";

        const [reminder] = getAdminWhatsAppTemplateConfiguration();

        expect(reminder.configured).toBe(true);
        expect(JSON.stringify(reminder)).not.toContain("HX_PRIVATE_FALLBACK");
    });
});
