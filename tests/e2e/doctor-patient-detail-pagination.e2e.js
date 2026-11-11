import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import pug from "pug";
import { chromium } from "playwright";

const cssPaths = [
    "public/css/app.css",
    "public/css/patient-dashboard.css",
    "public/css/doctor-dashboard.css",
    "public/css/doctor-patients.css",
];
const styles = await Promise.all(cssPaths.map((path) => readFile(path, "utf8")));
const script = await readFile("public/js/doctor-patients.js", "utf8");
const patients = [
    {
        id: 12,
        displayName: "Paciente de prueba",
        documentType: "CC",
        documentNumber: "TEST-001",
        profilePhotoUrl: null,
        lastAppointmentLabel: "10 nov 2026",
    },
];
const html = pug.renderFile("views/doctor/patients.pug", {
    pageTitle: "Pacientes | SaludVital",
    activeNav: "patients",
    bottomNavActive: "patients",
    doctorName: "Médico de prueba",
    doctorPhotoUrl: null,
    patients,
    pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    selectedPatientId: null,
    details: null,
    search: "",
});

const firstDetail = {
    patient: {
        id: 12,
        displayName: "Paciente de prueba",
        firstName: "Paciente",
        lastName: "De prueba",
        documentType: "CC",
        documentNumber: "TEST-001",
        profilePhotoUrl: null,
    },
    appointments: Array.from({ length: 10 }, (_, index) => ({
        id: index + 1,
        specialty: "Medicina general",
        reason: "Consulta de control",
        dateLabel: "10 de noviembre de 2026",
        timeLabel: "09:00 a. m.",
        status: "Attended",
    })),
    clinicalHistory: Array.from({ length: 10 }, (_, index) => ({
        id: index + 1,
        specialty: "Medicina general",
        reason: "Consulta de control",
        dateLabel: "10 de noviembre de 2026",
        timeLabel: "09:00 a. m.",
        symptoms: index === 0 ? '<img src="x" onerror="window.__unsafeRan=true">' : "Control",
        patientFeeling: "Estable",
        vitalSigns: {},
        diagnoses: [],
        prescriptions: [],
        medicalOrders: [],
    })),
    pagination: {
        pageSize: 10,
        appointments: { page: 1, totalItems: 12, totalPages: 2 },
        clinicalHistory: { page: 1, totalItems: 12, totalPages: 2 },
    },
};

const browser = await chromium.launch({ headless: true });

try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.setContent(html);
    for (const css of styles) await page.addStyleTag({ content: css });
    await page.evaluate(() => {
        window.__detailRequests = [];
        window.__unsafeRan = false;
        window.history.replaceState = () => {};
        window.fetch = async (url) => {
            window.__detailRequests.push(String(url));
            const requestUrl = new URL(String(url), "http://localhost");
            const requestedAppointmentPage =
                Number(requestUrl.searchParams.get("appointmentsPage")) || 1;
            const requestedHistoryPage = Number(requestUrl.searchParams.get("historyPage")) || 1;
            return {
                ok: true,
                json: async () => ({
                    ...window.__fixtureDetail,
                    pagination: {
                        ...window.__fixtureDetail.pagination,
                        appointments: {
                            page: requestedAppointmentPage,
                            totalItems: 12,
                            totalPages: 2,
                        },
                        clinicalHistory: {
                            page: requestedHistoryPage,
                            totalItems: 12,
                            totalPages: 2,
                        },
                    },
                }),
            };
        };
        window.__fixtureDetail = null;
    });
    await page.evaluate((detail) => {
        window.__fixtureDetail = detail;
    }, firstDetail);
    await page.addScriptTag({ content: script });

    assert.equal(await page.evaluate(() => window.__detailRequests.length), 0);
    await page.locator("[data-patient-row]").click();
    await page.getByRole("tab", { name: "Historial clínico" }).waitFor();
    assert.equal(await page.evaluate(() => window.__detailRequests.length), 1);
    assert.equal(await page.locator("#doctor-patient-history-panel img").count(), 0);
    assert.equal(await page.locator(".doctor-patient-history-card").count(), 10);

    await page.getByRole("tab", { name: "Citas" }).click();
    await page.getByRole("button", { name: "Siguiente" }).last().click();
    await page.waitForFunction(() => window.__detailRequests.length === 2);
    assert.match(await page.evaluate(() => window.__detailRequests.at(-1)), /appointmentsPage=2/);
    assert.match(await page.evaluate(() => window.__detailRequests.at(-1)), /historyPage=1/);
    assert.equal(
        await page.getByRole("tab", { name: "Citas" }).getAttribute("aria-selected"),
        "true",
    );
    assert.equal(await page.evaluate(() => window.__unsafeRan), false);

    for (const viewport of [390, 768, 1440]) {
        await page.setViewportSize({ width: viewport, height: 900 });
        assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            true,
            `Doctor patient view overflows horizontally at ${viewport}px.`,
        );
    }

    const accessibility = await new AxeBuilder({ page }).include("main").analyze();
    assert.deepEqual(accessibility.violations, []);
    console.log(
        "PASS: doctor patient detail pagination, deferred loading, responsive layout, and accessibility.",
    );
} finally {
    await browser.close();
}
