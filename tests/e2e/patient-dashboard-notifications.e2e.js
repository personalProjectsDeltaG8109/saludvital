import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const dashboardStyles = await readFile(path.resolve("public/css/patient-dashboard.css"), "utf8");
const appStyles = await readFile(path.resolve("public/css/app.css"), "utf8");
const dashboardScript = await readFile(
    path.resolve("public/js/patient-dashboard-notifications.js"),
    "utf8",
);
const browser = await chromium.launch({ headless: true });

try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on("pageerror", (error) => console.error(error));
    await page.setContent(`
        <!doctype html>
        <html lang="es">
        <head><title>Preferencias de notificaciones</title></head>
        <body class="sv-dashboard">
        <main>
            <h1 class="sr-only">Panel del paciente</h1>
            <section class="sv-panel sv-notifications" aria-labelledby="notifications-title" data-dashboard-notifications>
                <h2 id="notifications-title">Notificaciones</h2>
                <div class="sv-preference">
                    <span>WhatsApp</span>
                    <label class="sv-switch-control">
                        <input type="checkbox" role="switch" aria-label="Activar notificaciones por WhatsApp" checked data-dashboard-channel-toggle="WhatsApp">
                        <span class="sv-toggle is-active" aria-hidden="true"></span>
                    </label>
                </div>
                <div class="sv-preference">
                    <span>SMS</span>
                    <label class="sv-switch-control">
                        <input type="checkbox" role="switch" aria-label="Activar notificaciones por SMS" checked data-dashboard-channel-toggle="SMS">
                        <span class="sv-toggle is-active" aria-hidden="true"></span>
                    </label>
                </div>
                <div class="sv-preference">
                    <span>Correo</span>
                    <label class="sv-switch-control">
                        <input type="checkbox" role="switch" aria-label="Activar notificaciones por correo electrónico" data-dashboard-channel-toggle="Email">
                        <span class="sv-toggle" aria-hidden="true"></span>
                    </label>
                </div>
                <p role="status" aria-live="polite" data-dashboard-notification-feedback></p>
            </section>
        </main>
        </body>
        </html>
    `);
    await page.addStyleTag({ content: appStyles });
    await page.addStyleTag({ content: dashboardStyles });
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.evaluate(() => {
        window.fetch = async (_url, options) => {
            const request = JSON.parse(options.body);
            window.lastNotificationPreferenceRequest = request;
            if (request.channel === "SMS" && !request.isEnabled) {
                return new Response(
                    JSON.stringify({ success: false, message: "Mantén al menos un canal activo." }),
                    { status: 400, headers: { "Content-Type": "application/json" } },
                );
            }
            return new Response(
                JSON.stringify({
                    success: true,
                    message: "Se actualizó tu canal de notificaciones.",
                    data: { channelStates: { WhatsApp: false, SMS: true, Email: false } },
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
        };
    });
    await page.addScriptTag({ content: dashboardScript });

    const whatsappToggle = page.locator('[data-dashboard-channel-toggle="WhatsApp"]');
    await whatsappToggle.evaluate((toggle) => {
        toggle.checked = false;
        toggle.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForFunction(() =>
        document
            .querySelector("[data-dashboard-notification-feedback]")
            ?.textContent.includes("Se actualizó tu canal"),
    );
    if (await whatsappToggle.isChecked())
        throw new Error("A successful change should update the switch.");

    const smsToggle = page.locator('[data-dashboard-channel-toggle="SMS"]');
    await smsToggle.evaluate((toggle) => {
        toggle.checked = false;
        toggle.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForFunction(() =>
        document
            .querySelector("[data-dashboard-notification-feedback]")
            ?.textContent.includes("Mantén al menos un canal activo"),
    );
    if (!(await smsToggle.isChecked()))
        throw new Error("A rejected change should restore the switch.");

    for (const width of [390, 760, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const hasHorizontalOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        if (hasHorizontalOverflow) throw new Error(`Horizontal overflow at ${width}px.`);
    }

    const accessibility = await new AxeBuilder({ page }).analyze();
    if (accessibility.violations.length) {
        throw new Error(`Accessibility violations: ${JSON.stringify(accessibility.violations)}`);
    }

    console.log(
        "PASS: patient dashboard channel switches, validation feedback, responsive widths, and axe-core.",
    );
} finally {
    await browser.close();
}
