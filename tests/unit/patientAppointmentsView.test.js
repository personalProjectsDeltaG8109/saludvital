import { readFile } from "node:fs/promises";
import path from "node:path";
import pug from "pug";
import { canPatientRescheduleAppointment } from "../../src/modules/patient/services/appointmentRescheduleEligibility.js";

const projectRoot = process.cwd();
const patientRoutesSource = await readFile(
    path.join(projectRoot, "src/modules/patient/routes/patientRoutes.js"),
    "utf8",
);
const appointmentsTemplate = path.join(projectRoot, "views/patient/appointments.pug");

function renderAppointmentsPage(
    history = [],
    { status = "In Progress", startAt = "2026-11-03T15:00:00.000Z", canReschedule = false } = {},
) {
    const appointmentRecord = {
        id: 27,
        start_at: startAt,
        end_at: new Date(new Date(startAt).getTime() + 30 * 60 * 1000),
        status: { name: status },
        specialty: { name: "Medicina General" },
        doctor: { display_name: "Doctor de prueba" },
        doctor_label: "Doctor de prueba",
        history,
        can_reschedule: canReschedule,
    };

    return pug.renderFile(appointmentsTemplate, {
        pageTitle: "Mis citas | SaludVital",
        activeNav: "appointments",
        patientName: "Paciente de prueba",
        patientPhotoUrl: null,
        notificationCount: 0,
        notificationLabel: "Notificaciones",
        appointments: [appointmentRecord],
        appointmentStats: [
            { key: "all", label: "Total de citas", status: null, count: 1 },
            { key: "confirmed", label: "Confirmadas", status: "Confirmed", count: 0 },
            { key: "attended", label: "Atendidas", status: "Attended", count: 0 },
            { key: "cancelled", label: "Canceladas", status: "Cancelled", count: 0 },
        ],
        specialties: ["Medicina General"],
        filters: { filter: "all", status: "", search: "", specialty: "" },
        pagination: {
            page: 1,
            pageSize: 10,
            total: 1,
            totalPages: 1,
            firstResult: 1,
            lastResult: 1,
            previousUrl: null,
            nextUrl: null,
        },
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

    test("renders server-side filters and bounded pagination controls", () => {
        const html = renderAppointmentsPage();

        expect(html).toContain('method="get" action="/patient/appointments"');
        expect(html).toContain('name="pageSize"');
        expect(html).toContain('aria-label="Paginación de citas"');
        expect(html).toContain("Mostrando 1–1 de 1 citas");
    });

    test("does not show an unsupported clinic location in the list or appointment details", () => {
        const html = renderAppointmentsPage();

        expect(html).not.toContain("Sede");
        expect(html).toContain("Medicina General");
        expect(html).toContain("Doctor de prueba");
        expect(html).toContain("Fecha y hora");
        expect(html).toContain("Estado actual");
    });

    test("hides rescheduling for confirmed appointments with less than 24 hours remaining", () => {
        const now = Date.parse("2026-11-09T12:00:00.000Z");
        const appointment = {
            start_at: new Date(now + 23 * 60 * 60 * 1000),
            status: { name: "Confirmed" },
            history: [],
        };
        const canReschedule = canPatientRescheduleAppointment(appointment, now);
        const html = renderAppointmentsPage([], {
            status: appointment.status.name,
            startAt: appointment.start_at,
            canReschedule,
        });

        expect(canReschedule).toBe(false);
        expect(html).not.toContain("appointment-reschedule-link");
    });

    test("keeps rescheduling available at the exact 24-hour boundary", () => {
        const now = Date.parse("2026-11-09T12:00:00.000Z");
        const appointment = {
            start_at: new Date(now + 24 * 60 * 60 * 1000),
            status: { name: "Confirmed" },
            history: [],
        };
        const canReschedule = canPatientRescheduleAppointment(appointment, now);
        const html = renderAppointmentsPage([], {
            status: appointment.status.name,
            startAt: appointment.start_at,
            canReschedule,
        });

        expect(canReschedule).toBe(true);
        expect(html).toContain("appointment-reschedule-link");
    });

    test("prepares the list action with the shared rescheduling eligibility rule", () => {
        expect(patientRoutesSource).toMatch(
            /appointment\.can_reschedule\s*=\s*!previewMode\s*&&\s*canPatientRescheduleAppointment\(appointment, now\)/,
        );
    });

    test("labels appointment creation and no-show history events accurately", () => {
        const html = renderAppointmentsPage([
            { event_type: "Created", previous_values: null, new_values: { status: "Confirmed" } },
            {
                event_type: "NoShowMarked",
                previous_values: { status: "Confirmed" },
                new_values: { status: "No Show" },
            },
        ]);

        expect(html).toContain("Cita de demostración creada.");
        expect(html).toContain("Cita marcada como inasistencia.");
        expect(html).not.toContain("Fecha de reprogramación registrada");
    });
});
