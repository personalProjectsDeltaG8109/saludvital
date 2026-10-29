import { afterEach, describe, expect, test } from "@jest/globals";
import { getAdminWhatsAppTemplateConfiguration } from "../../src/modules/admin/services/adminWhatsAppTemplateService.js";

const environmentKeys = [
    "META_WHATSAPP_REMINDER_TEMPLATE_NAME",
    "META_WHATSAPP_RESCHEDULE_TEMPLATE_NAME",
    "META_WHATSAPP_CANCELLATION_TEMPLATE_NAME",
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
        process.env.META_WHATSAPP_REMINDER_TEMPLATE_NAME = "appointment_reminder";
        delete process.env.META_WHATSAPP_RESCHEDULE_TEMPLATE_NAME;
        delete process.env.META_WHATSAPP_CANCELLATION_TEMPLATE_NAME;

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
        expect(JSON.stringify(templates)).not.toContain("META_WHATSAPP_REMINDER_TEMPLATE_NAME");
        expect(JSON.stringify(templates)).not.toContain("Aprobada");
    });

    test("reports provider template names only as configured state", () => {
        delete process.env.META_WHATSAPP_REMINDER_TEMPLATE_NAME;
        process.env.META_WHATSAPP_RESCHEDULE_TEMPLATE_NAME = "reschedule_notice";

        const templates = getAdminWhatsAppTemplateConfiguration();

        expect(templates[1].configured).toBe(true);
        expect(JSON.stringify(templates)).not.toContain("reschedule_notice");
    });
});
