import { readFile } from "node:fs/promises";
import path from "node:path";
import pug from "pug";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const dashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const notificationsStyles = await readFile(
    path.resolve("public/css/admin-notifications.css"),
    "utf8",
);
const notificationsScript = await readFile(
    path.resolve("public/js/admin-notifications.js"),
    "utf8",
);

const html = pug
    .renderFile(path.resolve("views/admin/notifications.pug"), {
        pageTitle: "Notificaciones | SaludVital",
        adminName: "Administradora de prueba",
    })
    .replace("<head>", '<head><base href="http://localhost/">');

const notification = {
    id: 1,
    eventType: "Recordatorio de cita",
    summary: "Recordatorio de cita médica",
    channel: "WhatsApp",
    recipientName: "Paciente de prueba",
    maskedRecipient: "••• 8332",
    occurredAt: "2026-10-30T15:00:00.000Z",
    applicationStatus: "Aceptado por el proveedor",
    providerStatus: "Entregado por Meta",
    deliveryStatus: "Entregada",
    tone: "success",
    failureSummary: null,
};

function responseData(pageNumber, rows = [notification]) {
    return {
        period: { days: 30, start: "2026-10-01T05:00:00.000Z", end: "2026-10-31T05:00:00.000Z" },
        summary: { totalSent: 1, delivered: 1, failed: 0, pending: 0 },
        rows,
        filters: { channel: "all", status: "all", search: "" },
        pagination: {
            page: pageNumber,
            pageSize: 8,
            totalItems: rows.length ? 25 : 0,
            totalPages: rows.length ? 4 : 1,
        },
    };
}

const browser = await chromium.launch({ channel: "chrome", headless: true });

try {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    const requests = [];
    await page.route("http://localhost/admin/notifications", (route) =>
        route.fulfill({ status: 200, contentType: "text/html", body: html }),
    );
    await page.route("http://localhost/api/admin/notifications?**", async (route) => {
        const url = new URL(route.request().url());
        requests.push(Object.fromEntries(url.searchParams.entries()));
        if (url.searchParams.get("search") === "error") {
            return route.fulfill({
                status: 503,
                contentType: "application/json",
                body: JSON.stringify({ message: "No pudimos cargar las notificaciones." }),
            });
        }
        const rows = url.searchParams.get("search") === "sin resultados" ? [] : [notification];
        return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(responseData(Number(url.searchParams.get("page")) || 1, rows)),
        });
    });
    await page.goto("http://localhost/admin/notifications");
    await page.addStyleTag({ content: dashboardStyles });
    await page.addStyleTag({ content: notificationsStyles });
    await page.addScriptTag({ content: notificationsScript });
    await page.waitForSelector("[data-notifications-results]:not([hidden])");

    if ((await page.locator("[data-notifications-mobile-list]").isVisible()) !== true) {
        throw new Error("The mobile notification list should be visible at phone width.");
    }
    if ((await page.locator("[data-notifications-table-wrap]").isVisible()) !== false) {
        throw new Error("The desktop table should be hidden on phones.");
    }

    await page.getByRole("button", { name: /WhatsApp/ }).click();
    await page.locator("[data-notification-search]").fill("Laura");
    await page.waitForTimeout(350);
    await page.locator("[data-notification-status]").selectOption("delivered");
    await page.locator("[data-notification-period]").selectOption("7");
    await page.waitForTimeout(100);
    const latestRequest = requests.at(-1);
    if (
        latestRequest.channel !== "WhatsApp" ||
        latestRequest.search !== "Laura" ||
        latestRequest.status !== "delivered" ||
        latestRequest.period !== "7" ||
        latestRequest.page !== "1"
    ) {
        throw new Error("Notification channel, search, status, and period filters must combine.");
    }

    await page.locator("[data-notifications-next]").click();
    await page.waitForTimeout(100);
    if (requests.at(-1).page !== "2") throw new Error("Next-page control should request page two.");

    await page.locator("[data-notification-search]").fill("sin resultados");
    await page.waitForTimeout(350);
    if ((await page.locator("[data-notifications-empty]").isVisible()) !== true) {
        throw new Error("An empty notification result should show its empty state.");
    }

    await page.locator("[data-notification-search]").fill("error");
    await page.waitForTimeout(350);
    if (!(await page.locator("[data-notifications-error]").isVisible())) {
        throw new Error("A failed notification request should show an accessible error state.");
    }

    for (const width of [320, 375, 430, 760, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(30);
        const dimensions = await page.evaluate(() => ({
            viewportWidth: document.documentElement.clientWidth,
            pageWidth: document.documentElement.scrollWidth,
        }));
        if (dimensions.pageWidth > dimensions.viewportWidth) {
            throw new Error(
                `Horizontal page overflow at ${width}px: ${JSON.stringify(dimensions)}.`,
            );
        }
    }

    const accessibility = await new AxeBuilder({ page }).analyze();
    if (accessibility.violations.length) {
        throw new Error(
            `Accessibility violations: ${accessibility.violations.map((violation) => violation.id).join(", ")}`,
        );
    }

    console.log(
        "PASS: notification filters, pagination, empty and error states, accessibility, and responsive widths.",
    );
} finally {
    await browser.close();
}
