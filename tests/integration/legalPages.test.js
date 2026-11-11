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
});
