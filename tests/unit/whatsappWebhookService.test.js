import { createHmac } from "node:crypto";
import { afterEach, describe, expect, test } from "@jest/globals";
import {
    messageExpiryDate,
    verifyMetaWebhookChallenge,
    verifyMetaWebhookSignature,
} from "../../src/modules/patient/services/whatsappWebhookService.js";

const environmentKeys = [
    "META_WHATSAPP_WEBHOOK_VERIFY_TOKEN",
    "WHATSAPP_MESSAGE_RETENTION_DAYS",
    "WHATSAPP_VERIFICATION_SECRET",
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

describe("Meta WhatsApp webhook security and retention", () => {
    test("accepts only the configured webhook verification token", () => {
        process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN = "local-token";
        expect(
            verifyMetaWebhookChallenge({
                "hub.mode": "subscribe",
                "hub.verify_token": "local-token",
                "hub.challenge": "challenge-value",
            }),
        ).toBe("challenge-value");
        expect(
            verifyMetaWebhookChallenge({
                "hub.mode": "subscribe",
                "hub.verify_token": "wrong-token",
                "hub.challenge": "challenge-value",
            }),
        ).toBeNull();
    });

    test("validates Meta HMAC signatures with the original request body", () => {
        const body = Buffer.from('{"object":"whatsapp_business_account"}');
        const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
        expect(verifyMetaWebhookSignature(body, signature, "secret")).toBe(true);
        expect(verifyMetaWebhookSignature(Buffer.from("{}"), signature, "secret")).toBe(false);
        expect(verifyMetaWebhookSignature(body, signature, "wrong-secret")).toBe(false);
    });

    test("caps message retention at 30 days and uses the default for invalid values", () => {
        const reference = new Date("2026-10-28T12:00:00.000Z");
        process.env.WHATSAPP_MESSAGE_RETENTION_DAYS = "30";
        expect(messageExpiryDate(reference).getTime() - reference.getTime()).toBe(
            30 * 24 * 60 * 60 * 1000,
        );
        process.env.WHATSAPP_MESSAGE_RETENTION_DAYS = "90";
        expect(messageExpiryDate(reference).getTime() - reference.getTime()).toBe(
            30 * 24 * 60 * 60 * 1000,
        );
        delete process.env.WHATSAPP_MESSAGE_RETENTION_DAYS;
        expect(messageExpiryDate(reference).getTime() - reference.getTime()).toBe(
            30 * 24 * 60 * 60 * 1000,
        );
    });
});
