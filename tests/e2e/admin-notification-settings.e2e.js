import { readFile } from "node:fs/promises";
import path from "node:path";
import pug from "pug";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { getAdminNotificationSettings } from "../../src/modules/admin/services/adminNotificationSettingsService.js";

const dashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const notificationStyles = await readFile(
    path.resolve("public/css/admin-notifications.css"),
    "utf8",
);
const settings = getAdminNotificationSettings();
const html = pug
    .renderFile(path.resolve("views/admin/notification-settings.pug"), {
        pageTitle: "Configuración de notificaciones | SaludVital",
        adminName: "Administradora de prueba",
        settings,
    })
    .replace("<head>", '<head><base href="http://localhost/">');
const browser = await chromium.launch({ channel: "chrome", headless: true });

try {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await page.setContent(html);
    await page.addStyleTag({ content: dashboardStyles });
    await page.addStyleTag({ content: notificationStyles });

    if ((await page.locator(".admin-notification-settings-card").count()) !== 3) {
        throw new Error("The settings page should render the three supported providers.");
    }
    if (await page.getByText("Conectado", { exact: true }).count()) {
        throw new Error(
            "Environment configuration must not be presented as provider connectivity.",
        );
    }
    if (await page.getByRole("button", { name: /guardar|editar/i }).count()) {
        throw new Error("Unsupported operational settings must remain read-only.");
    }

    for (const width of [320, 375, 430, 760, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const dimensions = await page.evaluate(() => {
            const cards = [...document.querySelectorAll(".admin-notification-settings-card")].map(
                (card) => {
                    const { left, right, top, bottom } = card.getBoundingClientRect();
                    return { left, right, top, bottom };
                },
            );
            const cardOverlap = cards.some((card, index) =>
                cards
                    .slice(index + 1)
                    .some(
                        (other) =>
                            card.left < other.right - 1 &&
                            card.right > other.left + 1 &&
                            card.top < other.bottom - 1 &&
                            card.bottom > other.top + 1,
                    ),
            );

            return {
                viewportWidth: document.documentElement.clientWidth,
                pageWidth: document.documentElement.scrollWidth,
                cardOverlap,
            };
        });
        if (dimensions.pageWidth > dimensions.viewportWidth) {
            throw new Error(`Horizontal overflow at ${width}px: ${JSON.stringify(dimensions)}.`);
        }
        if (dimensions.cardOverlap) {
            throw new Error(`Notification settings cards overlap at ${width}px.`);
        }
    }

    const accessibility = await new AxeBuilder({ page }).analyze();
    if (accessibility.violations.length) {
        throw new Error(
            `Accessibility violations: ${JSON.stringify(
                accessibility.violations.map(({ id, nodes }) => ({
                    id,
                    targets: nodes.map(({ target }) => target),
                })),
            )}`,
        );
    }

    console.log(
        "PASS: notification settings rendering, read-only behavior, responsive widths, and axe-core.",
    );
} finally {
    await browser.close();
}
