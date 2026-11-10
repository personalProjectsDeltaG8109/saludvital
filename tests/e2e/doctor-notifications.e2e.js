import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import pug from "pug";
import { chromium } from "playwright";

const styles = await Promise.all(
    [
        "public/css/app.css",
        "public/css/patient-dashboard.css",
        "public/css/doctor-dashboard.css",
        "public/css/doctor-notifications.css",
    ].map((filePath) => readFile(path.resolve(filePath), "utf8")),
);
const notificationScript = await readFile(
    path.resolve("public/js/doctor-notifications.js"),
    "utf8",
);
const sidebarScript = await readFile(path.resolve("public/js/patient-sidebar.js"), "utf8");
const html = pug.renderFile(path.resolve("views/doctor/notifications.pug"), {
    pageTitle: "Notificaciones | SaludVital",
    activeNav: "notifications",
    bottomNavActive: "notifications",
    doctorName: "Dra. Ejemplo",
    doctorPhotoUrl: null,
    notifications: {
        page: 1,
        pageSize: 20,
        totalItems: 2,
        totalPages: 1,
        unreadCount: 1,
        items: [
            {
                id: 1,
                eventType: "Rescheduled",
                label: "Cita reprogramada",
                occurredAtLabel: "2 nov 2026, 10:00 a. m.",
                appointmentAtLabel: "5 nov 2026, 10:00 a. m.",
                isRead: false,
            },
            {
                id: 2,
                eventType: "Cancelled",
                label: "Cita cancelada",
                occurredAtLabel: "1 nov 2026, 9:00 a. m.",
                appointmentAtLabel: "4 nov 2026, 9:00 a. m.",
                isRead: false,
            },
        ],
    },
});

const browser = await chromium.launch({ headless: true });

try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    assert.match(html, /href="\/css\/patient-dashboard\.css"/);
    await page.setContent(html);
    for (const css of styles) await page.addStyleTag({ content: css });
    assert.equal(
        await page.locator(".sv-layout").evaluate((layout) => getComputedStyle(layout).display),
        "block",
    );
    assert.equal(
        await page.locator(".sv-sidebar").evaluate((sidebar) => getComputedStyle(sidebar).position),
        "fixed",
    );
    await page.evaluate((source) => {
        window.__notificationIntervals = [];
        window.__setUnreadCount = (count) => {
            window.__unreadCount = count;
        };
        window.__unreadCount = 1;
        window.setInterval = (callback) => {
            window.__notificationIntervals.push(callback);
            return 1;
        };
        window.fetch = async () => ({
            ok: true,
            json: async () => ({ success: true, unreadCount: window.__unreadCount }),
        });
        const script = document.createElement("script");
        script.textContent = source;
        document.body.append(script);
    }, sidebarScript);
    await page.locator(".sv-notification-count").getByText("1").waitFor();
    await page.evaluate(async () => {
        window.__setUnreadCount(2);
        await window.__notificationIntervals[0]();
    });
    await page.locator(".sv-notification-count").getByText("2").waitFor();
    await page.evaluate(() => {
        window.__setUnreadCount(0);
        document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.locator(".sv-notification-count").waitFor({ state: "detached" });
    assert.equal(await page.locator(".sv-bell").getAttribute("aria-label"), "Notificaciones");

    await page.setViewportSize({ width: 1280, height: 900 });
    assert.equal(
        await page.locator(".sv-layout").evaluate((layout) => getComputedStyle(layout).display),
        "flex",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate((source) => {
        window.fetch = async () => ({
            ok: true,
            json: async () => ({ success: true, unreadCount: 0 }),
        });
        const script = document.createElement("script");
        script.textContent = source;
        document.body.append(script);
    }, notificationScript);

    await page.getByRole("heading", { name: "Notificaciones" }).waitFor();
    await page.locator("[data-notification-details]").first().click();
    const detailDialog = page.getByRole("dialog", { name: "Detalle de notificación" });
    const detailLabel = detailDialog.locator("[data-detail-label]");
    await detailLabel.waitFor();
    assert.equal(await detailLabel.textContent(), "Cita reprogramada");
    await detailDialog.getByText("5 nov 2026, 10:00 a. m.").waitFor();
    const mobileDialogBox = await detailDialog.boundingBox();
    assert.ok(mobileDialogBox);
    assert.ok(Math.abs(mobileDialogBox.x + mobileDialogBox.width / 2 - 195) < 2);
    assert.ok(Math.abs(mobileDialogBox.y + mobileDialogBox.height / 2 - 422) < 2);
    await page.setViewportSize({ width: 1280, height: 900 });
    const desktopDialogBox = await detailDialog.boundingBox();
    assert.ok(desktopDialogBox);
    assert.ok(Math.abs(desktopDialogBox.x + desktopDialogBox.width / 2 - 640) < 2);
    assert.ok(Math.abs(desktopDialogBox.y + desktopDialogBox.height / 2 - 450) < 2);
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("[data-mark-notification-read]").first().click();
    await page.locator(".doctor-notification-item.is-read").first().waitFor();
    await page.locator("[data-mark-all-notifications-read]").click();
    await page.getByText("Todas las notificaciones se marcaron como leídas.").waitFor();
    assert.equal(await page.locator(".doctor-notification-item.is-unread").count(), 0);
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
