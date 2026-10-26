import { describe, expect, test } from "@jest/globals";
import { createAppointmentCsv } from "../../src/modules/admin/services/adminAppointmentCsvService.js";

function createAppointment(values = {}) {
    return {
        id: 24,
        startAt: "2026-10-26T15:30:00.000Z",
        endAt: "2026-10-26T16:00:00.000Z",
        patientName: "María López",
        specialty: "Medicina General",
        doctor: "Dra. Ana Torres",
        statusLabel: "Confirmada",
        phone: "3001234567",
        clinicalReason: "private clinical information",
        ...values,
    };
}

describe("appointment CSV export", () => {
    test("includes the UTF-8 signature, Spanish columns, and the Colombia-local appointment time", () => {
        const csv = createAppointmentCsv([createAppointment()]);
        const localTime = new Intl.DateTimeFormat("es-CO", {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: "America/Bogota",
        }).format(new Date("2026-10-26T15:30:00.000Z"));

        expect(csv.charCodeAt(0)).toBe(0xfeff);
        expect(csv).toContain('"N\u00famero de cita"');
        expect(csv).toContain('"Fecha y hora de finalizaci\u00f3n"');
        expect(csv).toContain('"M\u00e9dico"');
        expect(csv).toContain(`"${localTime}"`);
        expect(csv.endsWith("\r\n")).toBe(true);
        expect(csv).not.toContain("3001234567");
        expect(csv).not.toContain("private clinical information");
    });

    test("escapes commas, quotes, line breaks, and Spanish characters", () => {
        const csv = createAppointmentCsv([
            createAppointment({ patientName: 'López, "María"\nGarcía' }),
        ]);

        expect(csv).toContain('"López, ""María""\nGarcía"');
    });

    test("prefixes formula-like user values before quoting CSV cells", () => {
        const csv = createAppointmentCsv([
            createAppointment({
                patientName: '=HYPERLINK("https://example.test")',
                specialty: "+SUM(1,1)",
                doctor: "-1+1",
                statusLabel: "@SUM(1)",
            }),
            createAppointment({ patientName: "\t=1+1" }),
        ]);

        expect(csv).toContain('"\'=HYPERLINK(""https://example.test"")"');
        expect(csv).toContain('"\'+SUM(1,1)"');
        expect(csv).toContain('"\'-1+1"');
        expect(csv).toContain('"\'@SUM(1)"');
        expect(csv).toContain('"\'\t=1+1"');
    });
});
