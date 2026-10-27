import { describe, expect, test } from "@jest/globals";
import pug from "pug";

describe("administrator profile page", () => {
    test("renders persisted account information without authentication secrets", () => {
        const html = pug.renderFile("views/admin/profile.pug", {
            pageTitle: "Mi perfil | SaludVital",
            adminName: "Laura Méndez",
            profile: {
                displayName: "Laura Méndez",
                email: "laura@example.com",
                emailVerified: true,
                phone: "+573001234567",
                role: "Administrator",
                isActive: true,
                createdAt: new Date("2025-01-15T10:00:00.000Z"),
                lastLoginAt: new Date("2026-10-27T10:24:00.000Z"),
                initials: "LM",
            },
        });

        expect(html).toContain("Laura Méndez");
        expect(html).toContain("laura@example.com");
        expect(html).toContain("+573001234567");
        expect(html).toContain("Información personal");
        expect(html).toContain("Seguridad");
        expect(html).toContain("Correo electrónico");
        expect(html).toContain("Verificado");
        expect(html).toContain("Recuperar contraseña");
        expect(html).toContain("Preferencias");
        expect(html).toContain("Activa");
        expect(html).not.toMatch(/password_hash|passwordHash|verification_token|token=/i);
    });

    test("does not invent a name for an account without one", () => {
        const html = pug.renderFile("views/admin/profile.pug", {
            pageTitle: "Mi perfil | SaludVital",
            adminName: "Administrador",
            profile: {
                displayName: null,
                email: "admin@example.com",
                phone: null,
                role: "Administrator",
                isActive: true,
                initials: "A",
            },
        });

        expect(html).toContain("Nombre no registrado");
        expect(html).toContain("admin@example.com");
        expect(html).toContain("Pendiente de verificación");
        expect(html).toContain("Confirma tu correo electrónico");
        expect(html).not.toContain("Recuperar contraseña");
    });
});
