import { describe, expect, test } from "@jest/globals";
import pug from "pug";

describe("patient registration view", () => {
    test("marks required fields and explains the marker", () => {
        const html = pug.renderFile("views/auth/register.pug", {
            pageTitle: "Crear cuenta | SaludVital",
        });

        expect(html).toContain("Campos obligatorios.");

        const requiredFields = [
            "first_name",
            "last_name",
            "document_type",
            "document_number",
            "date_of_birth",
            "phone",
            "email",
            "department",
            "municipality",
            "password",
            "password_confirmation",
            "health_data_consent",
        ];

        for (const fieldId of requiredFields) {
            const label = html.match(new RegExp(`<label[^>]*for="${fieldId}"[^>]*>(.*?)</label>`));

            expect(label?.[1]).toContain('aria-hidden="true">*</span>');
        }

        for (const fieldId of ["address", "blood_type", "allergies", "medical_conditions"]) {
            const label = html.match(new RegExp(`<label[^>]*for="${fieldId}"[^>]*>(.*?)</label>`));

            expect(label?.[1]).not.toContain('aria-hidden="true">*</span>');
        }
    });
});
