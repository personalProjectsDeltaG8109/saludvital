import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const script = await readFile(path.resolve("public/js/admin-doctor-schedules.js"), "utf8");
const styles = await readFile(path.resolve("public/css/admin-doctor-schedules.css"), "utf8");
const dashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const appStyles = await readFile(path.resolve("public/css/app.css"), "utf8");
const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on("pageerror", (error) => console.error("Browser error:", error.message));
    page.on("console", (message) => {
        if (message.type() === "error") console.error("Browser console:", message.text());
    });
    await page.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>
        <main class="doctor-schedules-page" data-doctor-schedules data-endpoint="/api/admin/doctor-schedules" data-weekly-endpoint="/api/admin/doctor-schedules">
          <header class="schedule-heading"><div><h1>Horarios y disponibilidad</h1></div><button data-configure-open disabled>Configurar horario</button></header>
          <p data-config-page-feedback hidden></p>
          <section class="schedule-stats"><strong data-stat-active-doctors></strong><strong data-stat-configured></strong><strong data-stat-exceptions></strong><strong data-stat-affected></strong></section>
          <form data-schedule-filters><input data-schedule-search><select data-schedule-doctor><option value="">Todos</option></select><select data-schedule-specialty><option value="">Todas</option></select><select data-schedule-status><option value="all">Todos</option></select><input data-schedule-week type="date" value="2026-10-26"><button type="button" data-week-previous></button><button type="button" data-week-next></button></form>
          <div data-schedule-week-label></div><p data-schedule-feedback hidden></p><p data-schedule-error hidden></p>
          <section data-weekly-view hidden><button type="button" data-weekly-clear></button><p data-weekly-doctor-name></p><p data-weekly-date-range></p><p data-weekly-feedback></p><p data-weekly-error hidden></p><div data-weekly-content hidden><div data-weekly-grid></div><p data-weekly-specialty></p><p data-weekly-duration></p><p data-weekly-working-days></p><p data-weekly-working-hours></p><p data-weekly-empty hidden></p></div></section>
          <div data-schedule-doctor-list></div><p data-schedule-empty hidden></p><ul data-schedule-exceptions></ul><p data-schedule-exceptions-empty hidden></p>
          <dialog class="schedule-config-dialog" data-schedule-config-dialog><form data-schedule-config-form><h2 data-config-title>Configurar horario</h2>
            <button type="button" data-config-close>Cerrar</button><p data-config-error hidden></p><p data-config-success hidden></p>
            <select data-config-doctor required></select><input type="date" data-config-valid-from required><input type="date" data-config-valid-until>
            <div data-config-day="1"><input type="checkbox" data-day-enabled><div data-config-intervals><div data-config-interval><input type="time" data-interval-start disabled><input type="time" data-interval-end disabled><button data-remove-interval hidden></button></div></div><button type="button" data-add-interval hidden></button></div>
            <section data-config-impact hidden><h3>Revisa las citas confirmadas</h3><ul data-config-impact-list></ul></section><button type="submit" data-config-submit>Guardar horario</button>
          </form></dialog>
        </main></body></html>`);
    await page.evaluate(() => {
        window.scheduleRequests = [];
        window.configurationAttempts = [];
        window.fetch = async (url, options = {}) => {
            if (options.method === "POST") {
                const payload = JSON.parse(options.body);
                window.configurationAttempts.push(payload);
                if (!payload.confirmImpact) {
                    return new Response(
                        JSON.stringify({
                            requiresConfirmation: true,
                            impactedAppointments: [
                                {
                                    id: 81,
                                    date: "2026-10-28",
                                    startTime: "09:00",
                                    endTime: "09:30",
                                    reason: "Fuera del horario propuesto",
                                },
                            ],
                        }),
                        { status: 409, headers: { "Content-Type": "application/json" } },
                    );
                }
                return new Response(
                    JSON.stringify({ message: "El horario se configuró correctamente." }),
                    { status: 201, headers: { "Content-Type": "application/json" } },
                );
            }
            window.scheduleRequests.push(String(url));
            const payload = String(url).includes("/week?")
                ? {
                      doctor: { id: 7, name: "Dra. Ana Torres", specialty: "Medicina General" },
                      appointmentDurationMinutes: 30,
                      workingDays: [],
                      week: { start: "2026-10-26", end: "2026-11-01" },
                      days: [
                          "2026-10-26",
                          "2026-10-27",
                          "2026-10-28",
                          "2026-10-29",
                          "2026-10-30",
                          "2026-10-31",
                          "2026-11-01",
                      ].map((date, index) => ({
                          date,
                          dayOfWeek: index + 1,
                          dayLabel: [
                              "Lunes",
                              "Martes",
                              "Miércoles",
                              "Jueves",
                              "Viernes",
                              "Sábado",
                              "Domingo",
                          ][index],
                          events: [],
                      })),
                  }
                : {
                      summary: {
                          activeDoctors: 1,
                          configuredSchedules: 0,
                          upcomingExceptions: 0,
                          affectedAppointments: 1,
                      },
                      doctors: [],
                      doctorOptions: [
                          {
                              id: 7,
                              name: "Dra. Ana Torres",
                              email: "ana@saludvital.co",
                              isActive: true,
                          },
                      ],
                      specialtyOptions: [],
                      exceptions: [],
                      week: { start: "2026-10-26", end: "2026-11-01" },
                  };
            return new Response(JSON.stringify(payload), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        };
    });
    await page.addStyleTag({ content: appStyles });
    await page.addStyleTag({ content: dashboardStyles });
    await page.addStyleTag({ content: styles });
    await page.addScriptTag({ content: script });
    await page.locator("[data-configure-open]:not([disabled])").waitFor();

    await page.locator("[data-configure-open]").focus();
    await page.keyboard.press("Enter");
    await page.locator("[data-schedule-config-dialog]").waitFor({ state: "visible" });
    await page.locator("[data-config-doctor]").selectOption("7");
    await page.locator("[data-config-valid-from]").fill("2026-10-26");
    await page.locator("[data-day-enabled]").check();
    await page.locator("[data-interval-start]").fill("08:00");
    await page.locator("[data-interval-end]").fill("12:00");
    await page.locator("[data-config-submit]").click();
    await page.locator("[data-config-impact]:visible").waitFor();
    assert.match(await page.locator("[data-config-impact-list]").textContent(), /Cita #81/);
    assert.match(await page.locator("[data-config-submit]").textContent(), /sin cambiar las citas/);
    await page.locator("[data-config-submit]").click();
    await page.locator("[data-schedule-config-dialog]").waitFor({ state: "hidden" });
    await page.locator("[data-config-page-feedback]:visible").waitFor();
    const attempts = await page.evaluate(() => window.configurationAttempts);
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].confirmImpact, false);
    assert.equal(attempts[1].confirmImpact, true);
    assert.equal(attempts[1].blocks[0].dayOfWeek, 1);
    console.log(
        "PASS: configuration requires an explicit review before keeping affected appointments unchanged.",
    );

    for (const viewport of [
        { width: 375, height: 812 },
        { width: 768, height: 1024 },
        { width: 1440, height: 900 },
    ]) {
        await page.setViewportSize(viewport);
        await page.locator("[data-configure-open]").click();
        const dimensions = await page.evaluate(() => ({
            viewport: document.documentElement.clientWidth,
            document: document.documentElement.scrollWidth,
        }));
        assert.ok(
            dimensions.document <= dimensions.viewport,
            `horizontal overflow at ${viewport.width}px`,
        );
        await page.locator("[data-config-close]").click();
        console.log(
            `PASS: schedule configuration has no horizontal overflow at ${viewport.width}x${viewport.height}.`,
        );
    }
} finally {
    await browser.close();
}
