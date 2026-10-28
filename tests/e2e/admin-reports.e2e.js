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
        total: 26,
        style: "background: conic-gradient(#13b87a 0deg 166deg, #ff4c55 166deg 263deg, #168de2 263deg 360deg)",
        description:
            "Distribución de 26 citas por estado: Confirmadas: 12, Canceladas: 7, Reprogramadas: 7.",
        segments: [
            { label: "Confirmadas", color: "#13b87a", count: 12, percentage: 37.5 },
            { label: "Canceladas", color: "#ff4c55", count: 7, percentage: 21.9 },
            { label: "Reprogramadas", color: "#168de2", count: 7, percentage: 21.9 },
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
        total: 24,
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
        selectedReportDays: 30,
    })
    .replace("<head>", '<head><base href="http://localhost/">');
function renderReportContent(days) {
    const periodStart = days === 7 ? "21 oct 2026" : days === 90 ? "30 jul 2026" : "28 sept 2026";
    return pug.renderFile(path.resolve("views/admin/partials/admin-reports-content.pug"), {
        reports: {
            ...reports,
            period: { label: `Últimos ${days} días`, start: periodStart, end: "27 oct 2026" },
        },
    });
}

const browser = await chromium.launch({ channel: "chrome", headless: true });

try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    let releaseReportResponse;
    const reportResponseGate = new Promise((resolve) => {
        releaseReportResponse = resolve;
    });
    let markReportRequestStarted;
    const reportRequestStarted = new Promise((resolve) => {
        markReportRequestStarted = resolve;
    });
    let releaseNinetyDayResponse;
    const requestedPeriods = [];
    const ninetyDayResponseGate = new Promise((resolve) => {
        releaseNinetyDayResponse = resolve;
    });
    await page.route("**/api/admin/reports**", async (route) => {
        markReportRequestStarted();
        const requestUrl = new URL(route.request().url());
        const days = Number(requestUrl.searchParams.get("period"));
        requestedPeriods.push(days);
        if (days === 30) await reportResponseGate;
        if (days === 90) await ninetyDayResponseGate;
        await route.fulfill({
            status: 200,
            contentType: "text/html",
            body: renderReportContent(days),
        });
    });
    await page.setContent(html);
    await page.addStyleTag({ content: dashboardStyles });
    await page.addStyleTag({ content: reportStyles });
    await page.addScriptTag({ content: dashboardScript });
    await page.addScriptTag({
        content: await readFile(path.resolve("public/js/admin-reports.js"), "utf8"),
    });
    await reportRequestStarted;
    await page.locator("[data-reports-loading]").waitFor({ state: "attached" });
    const isLoadingVisible = await page
        .locator("[data-reports-loading]")
        .evaluate((element) => !element.hidden);
    if (!isLoadingVisible) throw new Error("The reports loading state should be visible.");
    releaseReportResponse();
    await page.locator("[data-reports-results]:not([hidden])").waitFor();
    await page.locator("[data-report-period]").selectOption("7");
    await page.getByText("21 oct 2026 – 27 oct 2026").waitFor();
    await page.locator("[data-report-period]").selectOption("90");
    await page.locator("[data-reports-loading]:not([hidden])").waitFor();
    if (!(await page.locator("[data-reports-results]").evaluate((element) => element.hidden))) {
        throw new Error("Old report results must be hidden while the selected period is loading.");
    }
    releaseNinetyDayResponse();
    await page.getByText("30 jul 2026 – 27 oct 2026").waitFor();
    if ((await page.locator("[data-report-period]").inputValue()) !== "90") {
        throw new Error("The selected report period should remain visible after loading.");
    }
    const currentUrl = new URL(page.url());
    if (
        currentUrl.searchParams.get("period") !== "90" ||
        requestedPeriods.join(",") !== "30,7,90"
    ) {
        throw new Error("Each selected period must update the report request and page URL.");
    }
    console.log("PASS: 7/30/90-day selections reload all reports and prevent stale results.");

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
    await page.getByRole("img", { name: /Distribución de 26 citas por estado/ }).waitFor();
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
    await errorPage.route("**/api/admin/reports**", (route) =>
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
