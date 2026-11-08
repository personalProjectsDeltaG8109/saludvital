import { describe, expect, test } from "@jest/globals";
import pug from "pug";
import {
    canPatientCancelAppointment,
    canPatientRescheduleAppointment,
} from "../../src/modules/patient/services/appointmentRescheduleEligibility.js";

const now = Date.parse("2026-11-05T12:00:00Z");
function appointment(hours = 48, status = "Confirmed", count = 0) {
    return {
        id: 18,
        start_at: new Date(now + hours * 3600000),
        status: { name: status },
        doctor: { profile_photo_url: "/brand/logo-symbol.png" },
        doctor_label: "Dra. Ana Torres",
        specialty: { name: "Medicina general" },
        history: Array.from({ length: count }, () => ({ event_type: "Rescheduled" })),
    };
}
function render(nextAppointment) {
    return pug.renderFile("views/patient/dashboard.pug", {
        pageTitle: "Panel del paciente",
        patientName: "Paciente de prueba",
        activeNav: "home",
        nextAppointment,
        upcomingAppointments: [],
        notificationChannelStates: {},
        notificationCount: 0,
    });
}
describe("next appointment rescheduling eligibility", () => {
    test.each([
        [48, "Confirmed", 0, true],
        [24, "Confirmed", 2, true],
        [23.999, "Confirmed", 0, false],
        [48, "Confirmed", 3, false],
        [48, "In Progress", 0, false],
        [48, "Cancelled", 0, false],
        [-1, "Confirmed", 0, false],
    ])("%s hours, %s status, %s prior changes => %s", (hours, status, count, expected) => {
        expect(canPatientRescheduleAppointment(appointment(hours, status, count), now)).toBe(
            expected,
        );
    });
    test("does not count unrelated history events as reschedules", () => {
        const record = appointment();
        record.history = [{ event_type: "Created" }, { event_type: "Confirmed" }];
        expect(canPatientRescheduleAppointment(record, now)).toBe(true);
    });
});
describe("next appointment cancellation eligibility", () => {
    test.each([
        [48, "Confirmed", true],
        [24, "Confirmed", true],
        [23.999, "Confirmed", false],
        [48, "In Progress", false],
        [-1, "Confirmed", false],
    ])("%s hours, %s status => %s", (hours, status, expected) => {
        expect(canPatientCancelAppointment(appointment(hours, status), now)).toBe(expected);
    });
});
describe("next appointment card", () => {
    test.each([true, false])("renders only eligible rescheduling actions: %s", (eligible) => {
        const record = { ...appointment(), can_reschedule: eligible, can_cancel: eligible };
        const html = render(record);
        expect(html).toContain('href="/patient/appointments"');
        expect(html).toContain("Ver detalles");
        expect(html.includes('href="/patient/appointments/reschedule?appointmentId=18"')).toBe(
            eligible,
        );
        expect(html.includes('data-open-cancel-dialog="18"')).toBe(eligible);
        expect(html.includes('id="appointment-cancel-18"')).toBe(eligible);
        expect(html.includes("appointment-reschedule-link")).toBe(eligible);
        expect(html.includes("appointment-cancel-button")).toBe(eligible);
        expect(html).not.toContain("site_label");
        expect(html).not.toContain("Centro de atención");
        expect(html).not.toContain("Sede SaludVital");
        expect(html).not.toContain("data-open-reschedule-unavailable");
        if (!eligible)
            expect(
                html.slice(
                    html.indexOf('class="sv-appointment-buttons"'),
                    html.indexOf('class="appointment-details-dialog"'),
                ),
            ).not.toContain("Reprogramar cita");
        expect(html.indexOf("sv-appointment-doctor-name")).toBeLessThan(
            html.indexOf("sv-appointment-specialty"),
        );
    });
    test("shows cancellation independently when rescheduling is unavailable", () => {
        const html = render({
            ...appointment(48, "Confirmed", 3),
            can_reschedule: false,
            can_cancel: true,
        });
        expect(html.includes("appointment-reschedule-link")).toBe(false);
        expect(html.includes('data-open-cancel-dialog="18"')).toBe(true);
    });
    test("provides initials when the assigned doctor has no photo", () => {
        const record = appointment();
        record.doctor.profile_photo_url = null;
        expect(render(record)).toContain("sv-appointment-doctor-placeholder");
    });
    test("keeps the empty dashboard available", () => {
        expect(render(null)).toContain("No tienes citas próximas");
    });
});
