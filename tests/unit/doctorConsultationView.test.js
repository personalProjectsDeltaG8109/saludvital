import path from "node:path";
import pug from "pug";

const templatePath = path.join(process.cwd(), "views/doctor/consultation.pug");

function renderConsultationPage() {
    return pug.renderFile(templatePath, {
        pageTitle: "Consulta médica | SaludVital",
        activeNav: "appointments",
        doctorName: "Doctora de prueba",
        doctorPhotoUrl: null,
        consultation: { id: 88, started_at: "2026-11-02T15:00:00.000Z" },
        isAdultPatient: true,
        patient: { first_name: "Paciente", last_name: "de prueba" },
        appointment: {
            specialty: { name: "Medicina General" },
            status: { name: "En curso" },
            reason: "Consulta general",
        },
    });
}

function findElementById(html, tagName, id) {
    const elementPattern = new RegExp(`<${tagName}\\b(?=[^>]*\\bid="${id}")[^>]*>`);
    return html.match(elementPattern)?.[0] || "";
}

describe("doctor consultation form guidance", () => {
    test("explains required fields and that drafts can be saved before completion", () => {
        const html = renderConsultationPage();

        expect(html).toContain("Los campos marcados con * son obligatorios para finalizar.");
        expect(html).toContain("Puedes guardar un borrador antes de completarlos.");
        expect(html).toContain(
            "Si agregas un medicamento, completa su nombre, dosis, frecuencia y duración.",
        );
        expect(html).toContain("Órdenes médicas opcionales (una por línea)");
        expect(html).toContain("Recomendaciones (opcional)");
    });

    test.each([
        ["consultation-symptoms", "textarea", 'maxlength="500"'],
        ["consultation-feeling", "textarea", 'maxlength="500"'],
        ["consultation-evaluation", "textarea", 'maxlength="1500"'],
        ["diagnosis-entry", "input", 'maxlength="200"'],
        ["diagnosis-notes-entry", "input", 'maxlength="200"'],
        ["medication-name-help", "small", ""],
        ["medication-dosage-help", "small", ""],
        ["medication-frequency-help", "small", ""],
        ["medication-duration-help", "small", ""],
        ["medication-instructions-help", "small", ""],
        ["consultation-recommendations", "textarea", 'maxlength="500"'],
        ["consultation-orders", "textarea", 'maxlength="9029"'],
    ])("renders the configured field or help element %s", (id, tagName, expectedAttribute) => {
        const html = renderConsultationPage();
        const element = findElementById(html, tagName, id);

        expect(element).toContain(expectedAttribute);
        if (tagName !== "small") expect(element).toMatch(/aria-describedby="[^"]+"/);
    });

    test.each([
        ["medication-name-help", "medication-name", "150"],
        ["medication-dosage-help", "medication-dosage", "100"],
        ["medication-frequency-help", "medication-frequency", "100"],
        ["medication-duration-help", "medication-duration", "100"],
        ["medication-instructions-help", "medication-instructions", "1000"],
    ])("associates medication field %s with its supported limit", (helpId, fieldName, limit) => {
        const html = renderConsultationPage();
        const field = findElementById(html, "input", fieldName);

        expect(field).toContain(`maxlength="${limit}"`);
        expect(field).toContain(`aria-describedby="${helpId}"`);
    });

    test("shows instructions for each supported medication field limit", () => {
        const html = renderConsultationPage();

        expect(html).toContain("Hasta 150 caracteres.");
        expect(html.match(/Hasta 100 caracteres\./g)).toHaveLength(3);
        expect(html).toContain("Opcionales; hasta 1.000 caracteres.");
        expect(html).toContain("Máximo 30 órdenes; cada línea admite hasta 300 caracteres.");
    });

    test("shows vital-sign units, examples, technical limits, and adult reference guidance", () => {
        const html = renderConsultationPage();

        expect(html).toContain('data-adult-patient="true"');
        expect(html).toContain("Presión arterial (mmHg)");
        expect(html).toContain("Frecuencia cardiaca (lpm)");
        expect(html).toContain("Por ejemplo, 36.8");
        expect(html).toMatch(/Metros; límite técnico: 0,1.*3 m\./);
        expect(html).toContain("no constituye un diagnóstico");
        expect(html).toContain('id="heart-rate-warning"');
    });
});
