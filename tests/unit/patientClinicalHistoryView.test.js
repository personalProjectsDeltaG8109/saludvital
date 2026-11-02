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
    symptoms: "Consulta de control",
    clinical_notes: "Notas de seguimiento",
    vital_signs: {},
    diagnoses: [{ diagnosis: "Diagnóstico registrado", notes: "Nota clínica" }],
    prescriptions: [
        {
            items: [
                {
                    medication_name: "Medicamento registrado",
                    dosage: "10 mg",
                    frequency: "Una vez al día",
                    duration: "5 días",
                    instructions: "Tomar con agua",
                },
            ],
        },
    ],
    medical_orders: ["Orden persistida"],
    documents: ["Documento de ejemplo que no debe mostrarse"],
};

describe("patient clinical history view", () => {
    test("omits unsupported document controls while preserving persisted clinical information", () => {
        const html = renderClinicalHistory([consultation]);

        expect(html).not.toMatch(/Documentos médicos|data-detail-tab="documents"/);
        expect(html).not.toMatch(/Documento de ejemplo que no debe mostrarse/);
        expect(html).toContain("Consultas realizadas");
        expect(html).toContain("Diagnósticos registrados");
        expect(html).toContain("Tratamientos asignados");
        expect(html).toContain("Diagnóstico registrado");
        expect(html).toContain("Medicamento registrado");
        expect(html).toContain("Órdenes médicas");
        expect(html).toContain("Orden persistida");
    });

    test("keeps only the summary, diagnosis, and treatment tabs", () => {
        const html = renderClinicalHistory([consultation]);

        expect(html.match(/role="tab"/g)).toHaveLength(3);
        expect(html).toContain('data-detail-tab="summary"');
        expect(html).toContain('data-detail-tab="diagnoses"');
        expect(html).toContain('data-detail-tab="treatments"');
        expect(html).not.toContain('data-detail-panel="documents"');
    });
});
