import path from "node:path";
import pug from "pug";

const templatePath = path.join(process.cwd(), "views/patient/clinical-history.pug");

function renderClinicalHistory(consultations) {
    return pug.renderFile(templatePath, {
        pageTitle: "Historial clínico | SaludVital",
        activeNav: "clinical-history",
        patientName: "Paciente de prueba",
        patientPhotoUrl: null,
        notificationCount: 0,
        notificationLabel: "Notificaciones",
        welcomeMessage: "Consulta tus atenciones médicas.",
        consultations,
        totals: { consultations: consultations.length, diagnoses: 1, treatments: 1 },
        pagination: {
            page: 1,
            pageSize: 10,
            total: consultations.length,
            totalPages: consultations.length ? 1 : 0,
            firstResult: consultations.length ? 1 : 0,
            lastResult: consultations.length,
        },
        previewMode: false,
        previewAvailable: false,
    });
}

const consultation = {
    id: 42,
    doctor_label: "Dra. Laura Vélez",
    specialty_label: "Medicina General",
    date_label: "15 oct 2026",
    time_label: "08:00 a. m. - 08:30 a. m.",
    diagnosis_count: 1,
    treatment_count: 1,
    symptoms: "This private text must only be returned by the detail endpoint.",
    diagnoses: [{ diagnosis: "Diagnosis must not be in the summary." }],
    prescriptions: [{ items: [{ medication_name: "Medicine must not be in the summary." }] }],
};

describe("patient clinical history view", () => {
    test("renders a summary card and defers clinical details until selected", () => {
        const html = renderClinicalHistory([consultation]);

        expect(html).not.toMatch(/Documents|data-detail-tab="documents"/);
        expect(html).not.toContain(consultation.symptoms);
        expect(html).not.toContain("Diagnosis must not be in the summary.");
        expect(html).not.toContain("Medicine must not be in the summary.");
        expect(html).toContain("Consultas realizadas");
        expect(html).toContain('data-consultation-id="42"');
        expect(html).toContain("Paginación del historial clínico");
        expect(html).toContain("data-clinical-detail-content");
    });
});
