import { afterEach, describe, expect, test } from "@jest/globals";
import {
    getAdminNotificationSettings,
    getNotificationProviderPreflight,
} from "../../src/modules/admin/services/adminNotificationSettingsService.js";

const environmentKeys = [
    "NOTIFICATION_DELIVERY_ENABLED",
    "META_WHATSAPP_ACCESS_TOKEN",
    "META_WHATSAPP_PHONE_NUMBER_ID",
    "META_WHATSAPP_BUSINESS_ACCOUNT_ID",
    "META_WHATSAPP_APP_SECRET",
    "META_WHATSAPP_WEBHOOK_VERIFY_TOKEN",
    "META_WHATSAPP_API_VERSION",
    "META_WHATSAPP_TEMPLATE_LANGUAGE",
    "META_WHATSAPP_CONFIRMATION_TEMPLATE_NAME",
    "META_WHATSAPP_REMINDER_TEMPLATE_NAME",
    "META_WHATSAPP_RESCHEDULE_TEMPLATE_NAME",
    "META_WHATSAPP_CANCELLATION_TEMPLATE_NAME",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "RESEND_FROM_NAME",
    "INALAMBRIA_API_KEY",
    "WHATSAPP_VERIFICATION_SECRET",
    "WHATSAPP_CHATBOT_ENABLED",
    "NODE_ENV",
];
const originalEnvironment = Object.fromEntries(
    environmentKeys.map((key) => [key, process.env[key]]),
);

function clearProviderConfiguration() {
    for (const key of environmentKeys) delete process.env[key];
}

function setCompleteWhatsAppSendConfiguration() {
    process.env.META_WHATSAPP_ACCESS_TOKEN = "meta-private-token";
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = "private-phone-id";
    process.env.META_WHATSAPP_API_VERSION = "v25.0";
    process.env.META_WHATSAPP_TEMPLATE_LANGUAGE = "es_CO";
    process.env.META_WHATSAPP_CONFIRMATION_TEMPLATE_NAME = "confirmation";
    process.env.META_WHATSAPP_REMINDER_TEMPLATE_NAME = "reminder";
    process.env.META_WHATSAPP_RESCHEDULE_TEMPLATE_NAME = "reschedule";
    process.env.META_WHATSAPP_CANCELLATION_TEMPLATE_NAME = "cancellation";
}

afterEach(() => {
    for (const key of environmentKeys) {
        if (originalEnvironment[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnvironment[key];
    }
});

describe("administrator notification settings", () => {
    test("reports read-only provider configuration without exposing secret values", () => {
        clearProviderConfiguration();
        process.env.NOTIFICATION_DELIVERY_ENABLED = "true";
        setCompleteWhatsAppSendConfiguration();
        process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID = "private-business-id";
        process.env.META_WHATSAPP_APP_SECRET = "private-app-secret";
        process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN = "private-webhook-token";
        process.env.META_WHATSAPP_API_VERSION = "v25.0";
        process.env.META_WHATSAPP_TEMPLATE_LANGUAGE = "es_CO";
        process.env.RESEND_API_KEY = "resend-private-key";
        process.env.RESEND_FROM_EMAIL = "notifications@saludvital.test";
        process.env.INALAMBRIA_API_KEY = "sms-private-key";

        const settings = getAdminNotificationSettings();
        const serializedSettings = JSON.stringify(settings);

        expect(settings).toMatchObject({ deliveryEnabled: true, editable: false });
        expect(settings.channels.map(({ key }) => key)).toEqual(["whatsapp", "email", "sms"]);
        expect(settings.channels[0].configurationStatus).toBe("configured");
        expect(settings.channels[0].webhook.status).toBe("configured");
        expect(
            settings.channels.every(({ operationStatus }) => operationStatus === "unverified"),
        ).toBe(true);
        expect(serializedSettings).not.toContain("meta-private-token");
        expect(serializedSettings).not.toContain("private-phone-id");
        expect(serializedSettings).not.toContain("private-business-id");
        expect(serializedSettings).not.toContain("private-app-secret");
        expect(serializedSettings).not.toContain("private-webhook-token");
        expect(serializedSettings).not.toContain("resend-private-key");
        expect(serializedSettings).not.toContain("sms-private-key");
        expect(serializedSettings).not.toContain("META_WHATSAPP_ACCESS_TOKEN");
    });

    test("distinguishes incomplete provider settings from an unverified connection", () => {
        clearProviderConfiguration();
        process.env.NOTIFICATION_DELIVERY_ENABLED = "true";

        const settings = getAdminNotificationSettings();

        expect(
            settings.channels.map(({ configurationStatus, operationStatus }) => [
                configurationStatus,
                operationStatus,
            ]),
        ).toEqual([
            ["incomplete", "unavailable"],
            ["incomplete", "unavailable"],
            ["incomplete", "unavailable"],
        ]);
    });

    test("requires the confirmation template for WhatsApp send readiness", () => {
        clearProviderConfiguration();
        setCompleteWhatsAppSendConfiguration();
        delete process.env.META_WHATSAPP_CONFIRMATION_TEMPLATE_NAME;

        const preflight = getNotificationProviderPreflight();
        const whatsapp = preflight.channels.find(({ key }) => key === "whatsapp");

        expect(whatsapp.sendReady).toBe(false);
        expect(whatsapp.missingSendVariables).toContain("META_WHATSAPP_CONFIRMATION_TEMPLATE_NAME");
    });

    test("reports webhook readiness separately from sending prerequisites", () => {
        clearProviderConfiguration();
        setCompleteWhatsAppSendConfiguration();
        process.env.META_WHATSAPP_APP_SECRET = "private-app-secret";

        const preflight = getNotificationProviderPreflight();
        const whatsapp = preflight.channels.find(({ key }) => key === "whatsapp");
        const settings = getAdminNotificationSettings();
        const whatsappSettings = settings.channels.find(({ key }) => key === "whatsapp");

        expect(whatsapp.sendReady).toBe(true);
        expect(whatsapp.webhookReady).toBe(false);
        expect(whatsapp.missingWebhookVariables).toContain("META_WHATSAPP_WEBHOOK_VERIFY_TOKEN");
        expect(whatsappSettings.configurationStatus).toBe("configured");
        expect(whatsappSettings.webhook.status).toBe("incomplete");
    });

    test("preflight includes only missing variable names, never secret values", () => {
        clearProviderConfiguration();
        process.env.META_WHATSAPP_ACCESS_TOKEN = "do-not-print-this-token";

        const preflight = getNotificationProviderPreflight();
        const serializedPreflight = JSON.stringify(preflight);

        expect(preflight.channels[0].missingSendVariables).toContain(
            "META_WHATSAPP_CONFIRMATION_TEMPLATE_NAME",
        );
        expect(serializedPreflight).not.toContain("do-not-print-this-token");
        expect(preflight.manualChecks.length).toBeGreaterThan(0);
    });

    test("rejects example placeholders and checks the chatbot identity secret", () => {
        clearProviderConfiguration();
        process.env.NODE_ENV = "development";
        process.env.WHATSAPP_VERIFICATION_SECRET = "replace_with_a_long_random_secret";
        process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN = "your_private_verify_token";

        const preflight = getNotificationProviderPreflight();
        const whatsapp = preflight.channels.find(({ key }) => key === "whatsapp");

        expect(whatsapp.webhookReady).toBe(false);
        expect(whatsapp.missingWebhookVariables).toContain("META_WHATSAPP_WEBHOOK_VERIFY_TOKEN");
        expect(preflight.chatbot.runtimeEnabled).toBe(true);
        expect(preflight.chatbot.identityVerificationReady).toBe(false);
        expect(preflight.chatbot.missingVariables).toEqual(["WHATSAPP_VERIFICATION_SECRET"]);
    });

    test("reports delivery disabled without changing patient-specific settings", () => {
        clearProviderConfiguration();

        const settings = getAdminNotificationSettings();

        expect(settings.deliveryEnabled).toBe(false);
        expect(
            settings.channels.every(({ operationStatus }) => operationStatus === "disabled"),
        ).toBe(true);
        expect(settings).not.toHaveProperty("patientPreferences");
        expect(settings).not.toHaveProperty("updates");
    });
});
