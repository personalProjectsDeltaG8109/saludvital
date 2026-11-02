import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import pug from "pug";
import { chromium } from "playwright";

const styles = await Promise.all(
    [
        "public/css/app.css",
        "public/css/doctor-dashboard.css",
        "public/css/doctor-notifications.css",
    ].map((filePath) => readFile(path.resolve(filePath), "utf8")),
);
const notificationScript = await readFile(
    path.resolve("public/js/doctor-notifications.js"),
    "utf8",
);
const html = pug.renderFile(path.resolve("views/doctor/notifications.pug"), {
    pageTitle: "Notificaciones | SaludVital",
    activeNav: "notifications",
    bottomNavActive: "notifications",
    doctorName: "Dra. Ejemplo",
    doctorPhotoUrl: null,
    notifications: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        unreadCount: 1,
        items: [
            {
                id: 1,
                label: "Cita reprogramada",
                occurredAtLabel: "2 nov 2026, 10:00 a. m.",
                appointmentAtLabel: "5 nov 2026, 10:00 a. m.",
                isRead: false,
            },
        ],
    },
});

const browser = await chromium.launch({ headless: true });

try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.setContent(html);
    for (const css of styles) await page.addStyleTag({ content: css });
    await page.evaluate((source) => {
        window.fetch = async () => ({
            ok: true,
            json: async () => ({ unreadCount: 0 }),
        });
        const script = document.createElement("script");
        script.textContent = source;
        document.body.append(script);
    }, notificationScript);

    await page.getByRole("heading", { name: "Notificaciones" }).waitFor();
    await page.getByRole("button", { name: "Marcar como leída" }).click();
    await page.getByText("Leída").waitFor();
    assert.equal(
        await page.locator("body").evaluate((body) => body.scrollWidth <= innerWidth),
        true,
    );

    const accessibility = await new AxeBuilder({ page }).analyze();
    assert.deepEqual(accessibility.violations, []);
} finally {
    await browser.close();
}

process.stdout.write("Doctor notification responsive and accessibility checks passed.\n");
