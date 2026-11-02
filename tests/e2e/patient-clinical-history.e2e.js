import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";
import pug from "pug";

const cssFiles = [
    "public/css/app.css",
    "public/css/patient-dashboard.css",
    "public/css/patient-clinical-history.css",
];
const styles = await Promise.all(cssFiles.map((file) => readFile(path.resolve(file), "utf8")));
const consultations = [
    {
        id: 42,
        doctor_label: "Dra. Laura Vélez",
        specialty_label: "Medicina General",
        date_label: "15 oct 2026",
        time_label: "08:00 a. m. - 08:30 a. m.",
        symptoms: "Consulta de control",
        clinical_notes: "Notas de seguimiento",
        vital_signs: {},
        diagnoses: [{ diagnosis: "Diagnóstico registrado", notes: "Nota clínica" }],
        prescriptions: [{ items: [{ medication_name: "Medicamento registrado" }] }],
    },
    {
        id: 43,
        doctor_label: "Dr. Andrés Torres",
        specialty_label: "Cardiología",
        date_label: "20 sep 2026",
        time_label: "09:00 a. m. - 09:30 a. m.",
        symptoms: "Control preventivo",
        clinical_notes: "Sin hallazgos de alarma",
        vital_signs: {},
        diagnoses: [],
        prescriptions: [],
    },
];
const html = pug.renderFile("views/patient/clinical-history.pug", {
    pageTitle: "Historial clínico | SaludVital",
    activeNav: "clinical-history",
    patientName: "Paciente de prueba",
    patientPhotoUrl: null,
    notificationCount: 0,
    notificationLabel: "Notificaciones",
    welcomeMessage: "Consulta tus atenciones médicas.",
    consultations,
    totals: { consultations: 2, diagnoses: 1, treatments: 1 },
    previewMode: false,
    previewAvailable: false,
});
const script = await readFile(path.resolve("public/js/patient-clinical-history.js"), "utf8");
const browser = await chromium.launch({ headless: true });

try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.setContent(html);
    for (const style of styles) await page.addStyleTag({ content: style });
    await page.addScriptTag({ content: script });

    assert.equal(await page.getByText("Documentos médicos", { exact: true }).count(), 0);
    assert.equal(await page.locator('[data-detail-tab="documents"]').count(), 0);
    const firstRecordTabs = page
        .locator("[data-consultation-record]")
        .first()
        .locator("[data-detail-tab]");
    assert.equal(await firstRecordTabs.count(), 3);

    const search = page.locator("[data-consultation-search]");
    const cards = page.locator("[data-consultation-card]");
    await search.fill("Laura");
    assert.equal(
        await cards.nth(0).isVisible(),
        true,
        JSON.stringify(await cards.evaluateAll((items) => items.map((card) => card.dataset))),
    );
    assert.equal(await cards.nth(1).isVisible(), false);
    await search.fill("Cardiología");
    assert.equal(await cards.nth(0).isVisible(), false);
    assert.equal(await cards.nth(1).isVisible(), true);
    await search.fill("20 sep 2026");
    assert.equal(await cards.nth(1).isVisible(), true);

    await search.fill("");
    const filter = page.locator("[data-consultation-filter]");
    await filter.selectOption("diagnosis");
    assert.equal(
        await cards.nth(0).isVisible(),
        true,
        JSON.stringify(await cards.evaluateAll((items) => items.map((card) => card.dataset))),
    );
    assert.equal(await cards.nth(1).isVisible(), false);
    await filter.selectOption("treatment");
    assert.equal(await cards.nth(0).isVisible(), true);
    assert.equal(await cards.nth(1).isVisible(), false);
    await filter.selectOption("all");
    assert.equal(await cards.nth(0).isVisible(), true);
    assert.equal(await cards.nth(1).isVisible(), true);

    const treatmentTab = page
        .locator("[data-consultation-record]")
        .first()
        .locator('[data-detail-tab="treatments"]');
    await treatmentTab.focus();
    await page.keyboard.press("Enter");
    assert.equal(await treatmentTab.getAttribute("aria-selected"), "true");
    assert.equal(
        await page
            .locator("[data-consultation-record]")
            .first()
            .locator('[data-detail-panel="treatments"]')
            .isVisible(),
        true,
    );

    for (const width of [375, 760, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        assert.equal(overflow, false, `Clinical history must not overflow at ${width}px.`);
    }

    const accessibility = await new AxeBuilder({ page }).analyze();
    assert.deepEqual(accessibility.violations, []);
    console.log(
        "Patient clinical history search, filters, accessible tabs, and responsive layouts passed.",
    );
} finally {
    await browser.close();
}
