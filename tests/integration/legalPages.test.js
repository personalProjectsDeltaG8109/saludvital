import { describe, expect, test } from "@jest/globals";
import request from "supertest";
import app from "../../app.js";

const legalPages = [
    {
        paths: ["/privacy", "/privacy-policy"],
        activePath: "/privacy",
        heading: "Política de privacidad",
        pageContent: "Información recopilada",
    },
    {
        paths: ["/terms", "/terms-and-conditions"],
        activePath: "/terms",
        heading: "Términos y condiciones",
        pageContent: "Uso académico",
    },
    {
        paths: ["/help"],
        activePath: "/help",
        heading: "Centro de ayuda",
        pageContent: "¿Cómo ingreso?",
    },
];

describe("public legal pages", () => {
    test.each(legalPages.flatMap((page) => page.paths.map((path) => ({ ...page, path }))))(
        "$path renders its page in the login-style layout",
        async ({ activePath, heading, pageContent, path }) => {
            const response = await request(app).get(path);

            expect(response.status).toBe(200);
            expect(response.text).toContain("legal-split");
            expect(response.text).toContain("legal-document-panel");
            expect(response.text).toContain(heading);
            expect(response.text).toContain(pageContent);
            expect(response.text).toContain(
                `class="is-active" href="${activePath}" aria-current="page"`,
            );
        },
    );

    test("privacy notice explains the implemented retention limits and account deactivation behavior", async () => {
        const response = await request(app).get("/privacy");

        expect(response.status).toBe(200);
        expect(response.text).toContain("después de 30 minutos");
        expect(response.text).toContain("no puede superar 30 días");
        expect(response.text).toContain("no elimina automáticamente sus citas");
        expect(response.text).toContain("no define un plazo automático general");
        expect(response.text).toContain("30 días por defecto");
        expect(response.text).toContain("Resend");
        expect(response.text).toContain("Inalámbria Express");
        expect(response.text).toContain("Meta WhatsApp Cloud API");
        expect(response.text).toContain("no significa que esté conectada o activa");
    });

    test("academic terms allow controlled use of personal contact data without real clinical data", async () => {
        const response = await request(app).get("/terms");

        expect(response.status).toBe(200);
        expect(response.text).toContain("tus propios datos de identificación y contacto");
        expect(response.text).toContain("No ingreses datos de otros usuarios");
        expect(response.text).toContain("datos clínicos reales");
    });
});
