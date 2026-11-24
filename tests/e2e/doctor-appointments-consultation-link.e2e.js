import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import pug from "pug";
import { chromium } from "playwright";

const [stylesheets, appointmentsScript] = await Promise.all([
    Promise.all(
        [
            "public/css/app.css",
            "public/css/patient-dashboard.css",
            "public/css/doctor-dashboard.css",
        ].map((filePath) => readFile(filePath, "utf8")),
    ),
    readFile("public/js/doctor-appointments.js", "utf8"),
]);

function createAppointment({ id = 44, status = "In Progress", consultationId = 91 } = {}) {
    const isInProgress = status === "In Progress";
    return {
        id,
        startAt: new Date("2026-11-24T15:00:00.000Z"),
        dateLabel: "24 de noviembre",
        time: "10:00",
        meridiem: "a. m.",
        patientName: "Ana Pérez",
        patientPhotoUrl: null,
        reason: "Consulta general",
        specialty: "Medicina General",
        status,
        statusKey: status.toLowerCase().replaceAll(" ", "-"),
        statusLabel: isInProgress ? "En curso" : "Confirmada",
        canStart: status === "Confirmed",
        hasActiveConsultation: isInProgress,
        consultationId: isInProgress ? consultationId : null,
    };
}

function createAppointmentResponse(appointment, page = 1) {
    return {
        appointments: [appointment],
        appointmentCount: 12,
        appointmentTotalCount: 12,
        appointmentPage: page,
        appointmentPageSize: 6,
        appointmentTotalPages: 2,
    };
}

const renderedPage = pug
    .renderFile("views/doctor/appointments.pug", {
        pageTitle: "Mis citas | SaludVital",
        doctorName: "Dra. Ana Ramírez",
        doctorPhotoUrl: null,
        activeNav: "appointments",
        bottomNavActive: "appointments",
        appointmentsPath: "/doctor/appointments",
        appointmentFilters: { startDate: "", endDate: "", search: "", status: "" },
        appointmentTotalCount: 12,
        appointmentCount: 12,
        appointmentPage: 1,
        appointmentPageSize: 6,
        appointmentTotalPages: 2,
        appointmentStatuses: [
            { name: "Confirmed", label: "Confirmadas", summaryLabel: "Confirmadas", count: 6 },
        ],
        appointments: [createAppointment()],
    })
    .replace(/<link[^>]+rel="stylesheet"[^>]*>/g, "")
    .replace(/<script[^>]+src="[^"]+"[^>]*><\/script>/g, "")
    .replace("<head>", '<head><base href="http://localhost/">');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();

await page.route("**/api/doctor/appointments**", async (route) => {
    const parameters = new URL(route.request().url()).searchParams;
    const requestedPage = Number(parameters.get("page") || 1);
    const requestedStatus = parameters.get("status");

    if (requestedStatus === "Confirmed") {
        return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(
                createAppointmentResponse(createAppointment({ status: "Confirmed" })),
            ),
        });
    }

    const consultationId = requestedPage === 2 ? null : 91;
    return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
            createAppointmentResponse(createAppointment({ consultationId }), requestedPage),
        ),
    });
});

try {
    await page.setContent(`<style>${stylesheets.join("</style><style>")}</style>${renderedPage}`, {
        waitUntil: "domcontentloaded",
    });
    await page.addScriptTag({ content: appointmentsScript });

    const continueLink = page.getByRole("link", { name: "Continuar consulta" });
    await continueLink.waitFor({ state: "visible" });
    assert.equal(await continueLink.getAttribute("href"), "/doctor/consultations/91");

    const searchResponse = page.waitForResponse(
        (response) =>
            response.url().includes("/api/doctor/appointments?") &&
            response.url().includes("search=Ana"),
    );
    await page.locator("[data-live-search]").fill("Ana");
    await searchResponse;
    await page.getByRole("link", { name: "Continuar consulta" }).waitFor({ state: "visible" });
    assert.equal(
        await page.getByRole("link", { name: "Continuar consulta" }).getAttribute("href"),
        "/doctor/consultations/91",
    );

    const dateFilterResponse = page.waitForResponse(
        (response) =>
            response.url().includes("/api/doctor/appointments?") &&
            response.url().includes("startDate=2026-11-24"),
    );
    await page.locator('[data-appointment-filters] input[name="startDate"]').fill("2026-11-24");
    await dateFilterResponse;
    assert.equal(
        await page.getByRole("link", { name: "Continuar consulta" }).getAttribute("href"),
        "/doctor/consultations/91",
    );

    const accessibility = await new AxeBuilder({ page })
        .include('a[href^="/doctor/consultations/"]')
        .analyze();
    assert.deepEqual(
        accessibility.violations.map(({ id, impact }) => ({ id, impact })),
        [],
        "The continue-consultation link should be accessible.",
    );

    const nextPageResponse = page.waitForResponse(
        (response) =>
            response.url().includes("/api/doctor/appointments?") &&
            response.url().includes("page=2"),
    );
    await page.getByRole("button", { name: "Página siguiente" }).click();
    await nextPageResponse;
    await page.getByRole("cell", { name: "Consulta en curso" }).waitFor({ state: "visible" });
    assert.equal(await page.locator('a[href*="/doctor/consultations/null"]').count(), 0);
    assert.equal(await page.getByRole("link", { name: "Continuar consulta" }).count(), 0);

    const confirmedResponse = page.waitForResponse(
        (response) =>
            response.url().includes("/api/doctor/appointments?") &&
            response.url().includes("status=Confirmed"),
    );
    await page
        .locator('[data-appointment-filters] select[name="status"]')
        .selectOption("Confirmed");
    await confirmedResponse;
    await page.getByRole("button", { name: "Iniciar consulta con Ana Pérez" }).waitFor({
        state: "visible",
    });
    assert.equal(await page.getByRole("link", { name: "Continuar consulta" }).count(), 0);

    console.log(
        "PASS: consultation link survives appointment search, missing IDs stay safe, confirmed actions remain unchanged, and axe-core is clean.",
    );
} finally {
    await context.close();
    await browser.close();
}
