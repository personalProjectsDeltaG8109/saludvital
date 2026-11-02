import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import pug from "pug";
import { chromium } from "playwright";

const stylesheetPaths = [
    "public/css/app.css",
    "public/css/patient-dashboard.css",
    "public/css/doctor-dashboard.css",
    "public/css/doctor-consultation.css",
];
const [stylesheets, vitalGuidanceScript, consultationScript] = await Promise.all([
    Promise.all(stylesheetPaths.map((filePath) => readFile(filePath, "utf8"))),
    readFile("public/js/doctor-vital-sign-guidance.js", "utf8"),
    readFile("public/js/doctor-consultation.js", "utf8"),
]);
const html = pug
    .renderFile("views/doctor/consultation.pug", {
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
    })
    .replace(/<link[^>]+rel="stylesheet"[^>]*>/g, "")
    .replace(/<script[^>]+src="[^"]+"[^>]*><\/script>/g, "")
    .replace("<head>", '<head><base href="http://localhost/">');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
let savedDraft = {};
let completedPayload = null;

await page.route("**/api/doctor/consultations/88**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
        return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                symptoms: savedDraft.symptoms || "",
                patient_feeling: savedDraft.patientFeeling || "",
                clinical_notes: savedDraft.clinicalNotes || "",
                recommendations: savedDraft.recommendations || "",
                medical_orders: savedDraft.medicalOrders || [],
                vital_signs: savedDraft.vitalSigns || {},
            }),
        });
    }
    if (request.url().endsWith("/draft")) {
        savedDraft = request.postDataJSON();
        return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ message: "Borrador guardado correctamente." }),
        });
    }
    completedPayload = request.postDataJSON();
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
});
await page.route("**/doctor/appointments?status=Attended", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "Consulta finalizada." }),
);

async function loadConsultationPage() {
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    for (const content of stylesheets) await page.addStyleTag({ content });
    await page.addScriptTag({ content: vitalGuidanceScript });
    await page.addScriptTag({ content: consultationScript });
    await page.locator("[data-consultation-form]").waitFor();
}

try {
    await loadConsultationPage();
    await page.locator("#consultation-symptoms").fill("Dolor de cabeza");
    await page.locator("#consultation-feeling").fill("Estable");
    await page.locator("#consultation-blood-pressure").fill("120/80");
    await page.locator("#consultation-heart-rate").fill("72");
    await page.locator("#consultation-temperature").fill("36.8");
    await page.locator("#consultation-weight").fill("70");
    await page.locator("#consultation-height").fill("1.7");
    await page.locator("#consultation-evaluation").fill("Evaluación de prueba");
    await page.locator("[data-save-draft]").first().click();
    await page.getByText("Borrador guardado correctamente.").waitFor();
    assert.equal(savedDraft.symptoms, "Dolor de cabeza");

    const diagnosisStep = page.locator('[data-step-indicator="1"]');
    assert.equal(await diagnosisStep.isDisabled(), true);
    await page.locator("[data-next-step]").first().click();
    assert.equal(await diagnosisStep.isDisabled(), false);
    await diagnosisStep.focus();
    await page.keyboard.press("Enter");
    assert.equal(await diagnosisStep.getAttribute("aria-current"), "step");
    assert.match(await page.locator("[data-step-announcement]").textContent(), /Paso 2 de 4/);
    assert.equal(await page.locator('[data-step-indicator="2"]').isDisabled(), true);

    await page.locator('[data-step-indicator="0"]').click();
    assert.equal(await page.locator("#consultation-symptoms").inputValue(), "Dolor de cabeza");
    await page.locator('[data-consultation-step="0"] [data-next-step]').click();
    await page.locator('[data-consultation-step="1"] [data-next-step]').click();
    await page.locator("[data-save-draft]").nth(2).click();
    await page.getByText("Borrador guardado correctamente.").waitFor();
    assert.equal(savedDraft.clinicalNotes, "Evaluación de prueba");
    await page.locator('[data-consultation-step="2"] [data-next-step]').click();
    assert.match(
        await page.locator("[data-consultation-summary]").textContent(),
        /Dolor de cabeza/,
    );
    await page.locator("[data-complete-consultation]").click();
    await page.waitForURL("**/doctor/appointments?status=Attended");
    assert.equal(completedPayload.symptoms, "Dolor de cabeza");
    assert.equal(completedPayload.clinicalNotes, "Evaluación de prueba");

    await loadConsultationPage();
    assert.equal(await page.locator("#consultation-symptoms").inputValue(), "Dolor de cabeza");
    assert.equal(
        await page.locator("#consultation-evaluation").inputValue(),
        "Evaluación de prueba",
    );

    for (const viewport of [
        { width: 390, height: 844 },
        { width: 760, height: 1024 },
        { width: 768, height: 1024 },
        { width: 1366, height: 900 },
    ]) {
        await page.setViewportSize(viewport);
        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        assert.equal(overflow, false, `Consultation overflows at ${viewport.width}px`);
    }

    const accessibility = await new AxeBuilder({ page }).analyze();
    if (accessibility.violations.length) {
        console.error(
            JSON.stringify(
                accessibility.violations.map(({ id, nodes }) => ({
                    id,
                    nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
                })),
                null,
                2,
            ),
        );
    }
    assert.deepEqual(
        accessibility.violations.map(({ id, impact }) => ({ id, impact })),
        [],
        "Consultation page should not have axe-core violations",
    );
    console.log(
        "PASS: consultation progress navigation, draft save/recovery, completion, responsive widths, and axe-core.",
    );
} finally {
    await browser.close();
}
