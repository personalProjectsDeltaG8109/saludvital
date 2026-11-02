import { describe, expect, test } from "@jest/globals";
import pug from "pug";

describe("patient dashboard profile summary", () => {
    test("omits the summary card while keeping profile navigation available", () => {
        const html = pug.renderFile("views/patient/dashboard.pug", {
            pageTitle: "Patient dashboard",
            activeNav: "home",
            patientName: "Test Patient",
            patientPhotoUrl: null,
            nextAppointment: null,
            upcomingAppointments: [],
            notificationChannelStates: { WhatsApp: true, SMS: true, Email: false },
            homeHref: "/patient/dashboard",
            sidebarId: "patient-sidebar",
            notificationHref: "/patient/notifications",
            notificationLabel: "Notificaciones",
            notificationCount: 0,
            profileHref: "/patient/profile",
            profileLabel: "Abrir mi perfil",
            roleLabel: "Paciente",
            displayName: "Test Patient",
            topbarMessage: "Gestiona tus citas.",
        });

        expect(html).not.toContain('class="sv-panel sv-profile"');
        expect(html).not.toContain("Documento no registrado");
        expect(html).toContain('href="/patient/profile"');
        expect(html).toContain("Notificaciones por WhatsApp");
    });
});
