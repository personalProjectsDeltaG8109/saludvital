import { describe, expect, test } from "@jest/globals";
import { normalizeProfileEmail } from "../../src/modules/admin/services/adminProfileFieldValidation.js";

describe("administrator account email validation", () => {
    test.each([100, 105, 320])("accepts a valid account email of %i characters", (length) => {
        const suffix = "@example.com";
        const email = `${"a".repeat(length - suffix.length)}${suffix}`;

        expect(email).toHaveLength(length);
        expect(normalizeProfileEmail(email)).toBe(email);
    });

    test("rejects account emails longer than 320 characters", () => {
        const suffix = "@example.com";
        const email = `${"a".repeat(321 - suffix.length)}${suffix}`;

        expect(() => normalizeProfileEmail(email)).toThrow("El correo electrónico no es válido.");
    });

    test("keeps rejecting malformed account email addresses", () => {
        expect(() => normalizeProfileEmail("invalid-email")).toThrow(
            "Ingresa un correo electrónico válido.",
        );
    });
});
