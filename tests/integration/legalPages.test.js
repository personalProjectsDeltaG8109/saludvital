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
        pageContent: "¿Cómo creo y verifico mi cuenta?",
    },
];

describe("public legal pages", () => {
    test.each(legalPages.flatMap((page) => page.paths.map((path) => ({ ...page, path }))))(
        "$path renders its page in the login-style layout",
        async ({ activePath, heading, pageContent, path }) => {
            const response = await request(app).get(path);

            expect(response.status).toBe(200);
            expect(response.text.match(/<main\b/g) ?? []).toHaveLength(1);
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
        expect(response.text).toContain("datos del contacto de emergencia");
        expect(response.text).toContain("En demostraciones deben ser ficticios");
        expect(response.text).toContain("no se usan para enviar mensajes");
        expect(response.text).toContain("el contacto de emergencia");
    });

    test("academic terms allow controlled use of personal contact data without real clinical data", async () => {
        const response = await request(app).get("/terms");

        expect(response.status).toBe(200);
        expect(response.text).toContain("tus propios datos de identificación y contacto");
        expect(response.text).toContain("No ingreses datos de otras personas");
        expect(response.text).toContain("información clínica real");
    });

    test("help explains the current account, password, and appointment steps", async () => {
        const response = await request(app).get("/help");

        expect(response.status).toBe(200);
        expect(response.text).toContain(
            "Deben abrir el enlace enviado al correo antes de iniciar sesión",
        );
        expect(response.text).toContain("30 minutos");
        expect(response.text).toContain("recupero mi contraseña");
        expect(response.text).toContain("al menos 24 horas");
        expect(response.text).toContain("al menos 5 horas");
        expect(response.text).toContain("hasta 3 reprogramaciones");
        expect(response.text).toContain("tus propios datos de identificación y contacto");
        expect(response.text).toContain("información clínica ficticia");
    });

    test("terms describe the demo scope without implying an official SENA service", async () => {
        const response = await request(app).get("/terms");

        expect(response.status).toBe(200);
        expect(response.text).toContain("No es un servicio oficial del SENA ni una clínica");
        expect(response.text).toContain("horario debe iniciar con al menos 5 horas");
        expect(response.text).toContain("cada cita puede reprogramarse hasta 3 veces");
        expect(response.text).toContain("tus propios datos de identificación y contacto");
    });
});
