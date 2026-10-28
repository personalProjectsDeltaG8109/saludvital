import { readFile } from "node:fs/promises";
import path from "node:path";
import pug from "pug";
import { chromium } from "playwright";

const dashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const reportStyles = await readFile(path.resolve("public/css/admin-reports.css"), "utf8");
const dashboardScript = await readFile(path.resolve("public/js/admin-dashboard.js"), "utf8");
const reports = {
    period: { label: "Últimos 30 días", start: "28 sept 2026", end: "27 oct 2026" },
    summary: {
        totalAppointments: 32,
        attendedAppointments: 21,
        cancelledAppointments: 4,
        uniquePatients: 27,
        attendedPercentage: 66,
        cancellationRate: 13,
    },
    statusChart: {
        total: 32,
        style: "background: conic-gradient(#13b87a 0deg 140deg, #f59e0b 140deg 170deg, #168de2 170deg 300deg, #ff4c55 300deg 360deg)",
        description: "Distribución de citas por estado.",
        segments: [
            { label: "Confirmadas", color: "#13b87a", count: 12, percentage: 37.5 },
            { label: "En curso", color: "#f59e0b", count: 3, percentage: 9.4 },
            { label: "Atendidas", color: "#168de2", count: 13, percentage: 40.6 },
            { label: "Canceladas", color: "#ff4c55", count: 4, percentage: 12.5 },
        ],
    },
    specialties: [
        { name: "Medicina General", count: 18, height: 150, color: "#168de2" },
        { name: "Pediatría", count: 9, height: 75, color: "#13b8b0" },
        { name: "Otras", count: 5, height: 42, color: "#7c8ef5" },
    ],
    topDoctors: [
        { name: "Dra. Ana Torres", count: 12, rank: 1, width: 100 },
        { name: "Dr. Luis Morales", count: 8, rank: 2, width: 67 },
        { name: "Dra. Laura Méndez", count: 5, rank: 3, width: 42 },
    ],
    trend: {
        maximum: 8,
        dates: [
            { label: "28 sept", x: 12, showLabel: true },
            { label: "27 oct", x: 688, showLabel: true },
        ],
        series: [
            { label: "Atendidas", color: "#13b87a", points: "12,100 688,80" },
            { label: "Confirmadas", color: "#168de2", points: "12,180 688,60" },
            { label: "Canceladas", color: "#ff4c55", points: "12,205 688,170" },
        ],
    },
    averageConsultationMinutes: 28,
    whatsappAppointmentRequests: 7,
};
const html = pug
    .renderFile(path.resolve("views/admin/reports.pug"), {
        pageTitle: "Reportes e indicadores | SaludVital",
        adminName: "Administrador",
    })
    .replace("<head>", '<head><base href="http://localhost/">');
const reportContent = pug.renderFile(
    path.resolve("views/admin/partials/admin-reports-content.pug"),
    { reports },
);

const browser = await chromium.launch({ channel: "chrome", headless: true });

try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    let releaseReportResponse;
    const reportResponseGate = new Promise((resolve) => {
        releaseReportResponse = resolve;
    });
    await page.route("**/api/admin/reports", async (route) => {
        await reportResponseGate;
        await route.fulfill({ status: 200, contentType: "text/html", body: reportContent });
    });
    await page.setContent(html);
    await page.addStyleTag({ content: dashboardStyles });
    await page.addStyleTag({ content: reportStyles });
    await page.addScriptTag({ content: dashboardScript });
    await page.addScriptTag({
        content: await readFile(path.resolve("public/js/admin-reports.js"), "utf8"),
    });
    await page.locator("[data-reports-loading]").waitFor({ state: "attached" });
    const isLoadingVisible = await page
        .locator("[data-reports-loading]")
        .evaluate((element) => !element.hidden);
    if (!isLoadingVisible) throw new Error("The reports loading state should be visible.");
    releaseReportResponse();
    await page.locator("[data-reports-results]:not([hidden])").waitFor();

    for (const width of [320, 375, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const hasHorizontalOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
        );
        if (hasHorizontalOverflow) {
            throw new Error(`The administrator reports page overflows horizontally at ${width}px.`);
        }
    }

    await page.setViewportSize({ width: 375, height: 812 });
    const menuButton = page.getByRole("button", { name: "Abrir menú" });
    await menuButton.click();
    await page.locator("body.admin-app.is-sidebar-open").waitFor();
    if ((await menuButton.getAttribute("aria-expanded")) !== "true") {
        throw new Error("Opening the mobile sidebar must update its expanded state.");
    }
    await page.getByRole("link", { name: "Reportes e indicadores" }).waitFor();
    await page.locator(".admin-sidebar-collapse").click();
    await page.locator("body.admin-app:not(.is-sidebar-open)").waitFor();

    if (await page.getByText("Pacientes nuevos").count()) {
        throw new Error("The reports page must not display a new-patients indicator.");
    }
    await page.getByRole("img", { name: /Distribución de citas por estado/ }).waitFor();
    await page.getByRole("img", { name: /Distribución de citas por especialidad/ }).waitFor();
    await page.getByRole("img", { name: /Tendencia diaria de citas/ }).waitFor();
    console.log(
        "PASS: reports page renders the report charts and excludes the new-patients indicator.",
    );
    console.log(
        "PASS: reports layout has no horizontal overflow at mobile, tablet, laptop, and desktop widths.",
    );
    console.log("PASS: the shared mobile sidebar opens and closes on the reports page.");

    const errorPage = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await errorPage.route("**/api/admin/reports", (route) =>
        route.fulfill({
            status: 503,
            contentType: "application/json",
            body: '{"message":"Unavailable"}',
        }),
    );
    await errorPage.setContent(html);
    await errorPage.addStyleTag({ content: dashboardStyles });
    await errorPage.addStyleTag({ content: reportStyles });
    await errorPage.addScriptTag({
        content: await readFile(path.resolve("public/js/admin-reports.js"), "utf8"),
    });
    await errorPage.getByRole("alert").getByText("No pudimos cargar los reportes").waitFor();
    console.log("PASS: report loading and error states are announced accessibly.");
} finally {
    await browser.close();
}
