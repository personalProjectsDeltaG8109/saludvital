import { describe, expect, test } from "@jest/globals";
import pug from "pug";

describe("administrator profile page", () => {
    test("renders the saved administrator photo in the Dashboard-specific header", () => {
        const html = pug.renderFile("views/admin/dashboard.pug", {
            pageTitle: "Panel administrativo | SaludVital",
            adminName: "Administradora",
            adminHeaderName: "Laura Méndez",
            adminHeaderRole: "Administrador",
            adminPhotoUrl: "/uploads/profile-photos/admin.png",
            dashboard: {
                generatedAt: new Date("2026-11-03T12:00:00.000Z"),
                notificationAlertCount: 0,
                weeklyAppointments: [],
                selectedWeek: "current",
                specialties: [],
                recentActivity: [],
                systemNotifications: [],
                metrics: {
                    registeredUsers: 0,
                    activeUsers: 0,
                    appointmentsToday: 0,
                    completedAppointmentsToday: 0,
                    activeDoctors: 0,
                    pendingWhatsAppRequests: 0,
                },
                whatsapp: {
                    activeConversations: 0,
                    pendingRequests: 0,
                    integrationStatus: "Incomplete",
                },
            },
        });

        expect(html).toContain('src="/uploads/profile-photos/admin.png"');
        expect(html).toContain("Laura Méndez");
        expect(html).toContain("Administrador");
        expect(html).toContain('class="admin-user-avatar"');
        expect(html).not.toContain("admin-user-chevron");
    });

    test("renders persisted account information without authentication secrets", () => {
        const html = pug.renderFile("views/admin/profile.pug", {
            pageTitle: "Mi perfil | SaludVital",
            adminHeaderName: "Laura Méndez",
            adminHeaderRole: "Administrador",
            adminPhotoUrl: "/uploads/profile-photos/admin.png",
            adminName: "Laura Méndez",
            profile: {
                displayName: "Laura Méndez",
                email: "laura@example.com",
                emailVerified: true,
                phone: "+573001234567",
                role: "Administrator",
                isActive: true,
                createdAt: new Date("2025-01-15T10:00:00.000Z"),
                updatedAt: new Date("2026-10-26T10:00:00.000Z"),
                lastLoginAt: new Date("2026-10-27T10:24:00.000Z"),
                emailVerifiedAt: new Date("2026-10-01T10:00:00.000Z"),
                initials: "LM",
                adminNotificationsEnabled: true,
            },
        });

        expect(html).toContain("Laura Méndez");
        expect(html).toContain("laura@example.com");
        expect(html).toContain('src="/uploads/profile-photos/admin.png"');
        expect(html).toContain("Laura Méndez");
        expect(html).toContain("Administrador");
        expect(html).not.toContain("admin-user-chevron");
        expect(html).toContain("+573001234567");
        expect(html).toContain("Información personal");
        expect(html).toContain("Seguridad");
        expect(html).toContain("Correo electrónico");
        expect(html).toContain("Correo verificado");
        expect(html).toContain("Última actualización de la cuenta");
        expect(html).toContain("Correo verificado el");
        expect(html).toContain("Correo verificado");
        expect(html).toContain("Recuperar contraseña");
        expect(html).toContain("Preferencias");
        expect(html).toContain("Mostrar avisos recientes de entrega de citas a pacientes");
        expect(html).toContain("Activa");
        expect(html).not.toMatch(/password_hash|passwordHash|verification_token|token=/i);
    });

    test("does not invent a name for an account without one", () => {
        const html = pug.renderFile("views/admin/profile.pug", {
            pageTitle: "Mi perfil | SaludVital",
            adminHeaderName: "Administrador",
            adminHeaderRole: "Administrador",
            adminPhotoUrl: null,
            adminName: "Administrador",
            profile: {
                displayName: null,
                email: "admin@example.com",
                phone: null,
                role: "Administrator",
                isActive: true,
                emailVerifiedAt: null,
                initials: "A",
                adminNotificationsEnabled: true,
            },
        });

        expect(html).toContain("Nombre no registrado");
        expect(html).not.toContain("profile-photos");
        expect(html).toContain("admin@example.com");
        expect(html).not.toContain("Correo verificado el");
        expect(html).toContain("Verificación pendiente");
        expect(html).toContain("Confirma primero el correo electrónico de tu cuenta");
        expect(html).not.toContain("Recuperar contraseña");
    });
});
