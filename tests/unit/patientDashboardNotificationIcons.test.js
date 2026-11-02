import { describe, expect, test } from "@jest/globals";
import pug from "pug";

describe("patient dashboard notification channel icons", () => {
    test("renders a distinct decorative icon for each supported channel", () => {
        const html = pug.renderFile("views/patient/dashboard.pug", {
            pageTitle: "Patient dashboard",
            activeNav: "home",
            patientName: "Test Patient",
            patientPhotoUrl: null,
            patient: null,
            nextAppointment: null,
            upcomingAppointments: [],
            notificationChannelStates: { WhatsApp: true, SMS: true, Email: false },
            homeHref: "/patient/dashboard",
            sidebarId: "patient-sidebar",
            notificationHref: "/patient/notifications",
            notificationLabel: "Notificaciones",
            notificationCount: 2,
            profileHref: "/patient/profile",
            profileLabel: "Mi perfil",
            roleLabel: "Paciente",
            displayName: "Test Patient",
            topbarMessage: "Gestiona tus citas.",
        });

        expect(html).toMatch(
            /class="sv-preference-icon pref-green"[^>]*aria-hidden="true">\s*<img src="\/brand\/whatsapp-svgrepo-com\.svg" alt="">/,
        );
        expect(html).toMatch(
            /class="sv-preference-icon pref-blue"[^>]*aria-hidden="true">\s*<svg viewBox="0 0 24 24" focusable="false">\s*<path d="M4 5h16v12H9l-5 4V5Zm4 5h8m-8 4h5">/,
        );
        expect(html).toMatch(
            /class="sv-preference-icon pref-purple"[^>]*aria-hidden="true">\s*<svg viewBox="0 0 24 24" focusable="false">\s*<path d="M3 5h18v14H3zM3 6l9 7 9-7">/,
        );
        expect(html).toContain('aria-label="Activar notificaciones por WhatsApp"');
        expect(html).toContain('aria-label="Activar notificaciones por SMS"');
        expect(html).toContain('aria-label="Activar notificaciones por correo electrónico"');
    });
});
