import { readFile } from "node:fs/promises";
import path from "node:path";
import pug from "pug";

const projectRoot = process.cwd();
const patientRoutesSource = await readFile(
    path.join(projectRoot, "src/modules/patient/routes/patientRoutes.js"),
    "utf8",
);
const appointmentsTemplate = path.join(projectRoot, "views/patient/appointments.pug");

function renderAppointmentsPage() {
    const inProgressAppointment = {
        id: 27,
        start_at: "2026-11-03T15:00:00.000Z",
        end_at: "2026-11-03T15:30:00.000Z",
        status: { name: "In Progress" },
        specialty: { name: "Medicina General" },
        doctor: { display_name: "Doctor de prueba" },
        doctor_label: "Doctor de prueba",
        history: [],
    };

    return pug.renderFile(appointmentsTemplate, {
        pageTitle: "Mis citas | SaludVital",
        activeNav: "appointments",
        patientName: "Paciente de prueba",
        patientPhotoUrl: null,
        notificationCount: 0,
        notificationLabel: "Notificaciones",
        appointments: [inProgressAppointment],
        appointmentStats: [
            { key: "all", label: "Total de citas", status: null },
            { key: "confirmed", label: "Confirmadas", status: "Confirmed" },
            { key: "attended", label: "Atendidas", status: "Attended" },
            { key: "cancelled", label: "Canceladas", status: "Cancelled" },
        ],
        specialties: ["Medicina General"],
        previewMode: false,
        previewAvailable: false,
    });
}

describe("patient appointments view", () => {
    test("does not define a separate In Progress summary card", () => {
        const statsDefinition = patientRoutesSource.match(
            /const appointmentStats = \[([\s\S]*?)\n\];/,
        );

        expect(statsDefinition).not.toBeNull();
        expect(statsDefinition[1]).not.toMatch(/In Progress|in-progress|En curso/);
    });

    test("keeps In Progress appointments visible without a dedicated status filter", () => {
        const html = renderAppointmentsPage();

        expect(html).toContain('class="appointment-status status-in-progress">En curso</span>');
        expect(html).not.toMatch(/<option[^>]*value="In Progress"/);
        expect(html.match(/class="appointment-stat stat-/g)).toHaveLength(4);
    });

    test("does not show an unsupported clinic location in the list or appointment details", () => {
        const html = renderAppointmentsPage();

        expect(html).not.toContain("Sede");
        expect(html).toContain("Medicina General");
        expect(html).toContain("Doctor de prueba");
        expect(html).toContain("Fecha y hora");
        expect(html).toContain("Estado actual");
    });
});
