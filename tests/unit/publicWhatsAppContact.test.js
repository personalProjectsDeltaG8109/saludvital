import { afterEach, describe, expect, test } from "@jest/globals";
import { getConfiguredWhatsAppContactUrl } from "../../src/shared/utils/publicWhatsAppContact.js";

const originalContactNumber = process.env.LOGIN_WHATSAPP_CONTACT_NUMBER;

afterEach(() => {
    if (originalContactNumber === undefined) {
        delete process.env.LOGIN_WHATSAPP_CONTACT_NUMBER;
    } else {
        process.env.LOGIN_WHATSAPP_CONTACT_NUMBER = originalContactNumber;
    }
});

describe("configured public WhatsApp contact", () => {
    test.each([undefined, "", "not-a-phone", "123", "0000000000"])(
        "hides a missing or invalid contact: %s",
        (contactNumber) => {
            if (contactNumber === undefined) {
                delete process.env.LOGIN_WHATSAPP_CONTACT_NUMBER;
            } else {
                process.env.LOGIN_WHATSAPP_CONTACT_NUMBER = contactNumber;
            }

            expect(getConfiguredWhatsAppContactUrl()).toBeNull();
        },
    );

    test("normalizes a configured international phone number", () => {
        process.env.LOGIN_WHATSAPP_CONTACT_NUMBER = "+57 (300) 123-4567";

        expect(getConfiguredWhatsAppContactUrl()).toBe(
            "https://wa.me/573001234567?text=Hola%2C%20quisiera%20recibir%20informaci%C3%B3n%20sobre%20SaludVital.",
        );
    });
});
