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
    page.on("dialog", (dialog) => dialog.accept());
    await page.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>
        <main class="doctor-schedules-page" data-doctor-schedules data-endpoint="/api/admin/doctor-schedules" data-weekly-endpoint="/api/admin/doctor-schedules">
          <header class="schedule-heading"><div><h1>Horarios y disponibilidad</h1></div><button data-configure-open disabled>Configurar horario</button></header><p data-config-page-feedback hidden></p>
          <section class="schedule-stats"><strong data-stat-active-doctors></strong><strong data-stat-configured></strong><strong data-stat-exceptions></strong><strong data-stat-affected></strong></section>
          <form data-schedule-filters><input data-schedule-search><select data-schedule-doctor><option value="">Todos</option></select><select data-schedule-specialty><option value="">Todas</option></select><select data-schedule-status><option value="all">Todos</option></select><input data-schedule-week type="date" value="2026-10-26"><button type="button" data-week-previous></button><button type="button" data-week-next></button></form>
          <div data-schedule-week-label></div><p data-schedule-feedback hidden></p><p data-schedule-error hidden></p>
          <section data-weekly-view hidden><button type="button" data-weekly-clear></button><p data-weekly-doctor-name></p><p data-weekly-date-range></p><p data-weekly-feedback></p><p data-weekly-error hidden></p><div data-weekly-content hidden><div data-weekly-grid></div><p data-weekly-specialty></p><p data-weekly-duration></p><p data-weekly-working-days></p><p data-weekly-working-hours></p><p data-weekly-empty hidden></p><ul data-weekly-editable-blocks></ul></div></section>
          <div data-schedule-doctor-list></div><p data-schedule-empty hidden></p><ul data-schedule-exceptions></ul><p data-schedule-exceptions-empty hidden></p>
        </main>
        <dialog data-schedule-config-dialog><form data-schedule-config-form><header><h2 data-config-title></h2><button type="button" data-config-close>Cerrar</button></header><p data-config-error hidden></p><p data-config-success hidden></p>
            <select data-config-doctor required></select><input type="date" data-config-valid-from required><input type="date" data-config-valid-until>
            <div data-config-day="1"><label><input type="checkbox" data-day-enabled>Lunes</label><div data-config-intervals><div data-config-interval><input type="time" data-interval-start disabled><input type="time" data-interval-end disabled><button type="button" data-remove-interval hidden></button></div></div><button type="button" data-add-interval hidden>Agregar otro intervalo</button></div>
            <section data-config-impact hidden><h3>Revisa las citas confirmadas</h3><ul data-config-impact-list></ul></section><button type="button" data-config-delete hidden>Eliminar intervalo</button><button type="submit" data-config-submit>Guardar horario</button>
          </form></dialog>
        </body></html>`);
    await page.evaluate(() => {
        window.scheduleBlock = {
            id: 31,
            doctorId: 7,
            dayOfWeek: 1,
            dayLabel: "Lunes",
            startTime: "08:00",
            endTime: "12:00",
            validFrom: "2026-01-01",
            validUntil: null,
        };
        window.patchAttempts = [];
        window.deleteAttempts = [];
        window.fetch = async (url, options = {}) => {
            if (options.method === "DELETE") {
                const payload = JSON.parse(options.body);
                window.deleteAttempts.push(payload);
                if (!payload.confirmImpact) {
                    return new Response(
                        JSON.stringify({
                            requiresConfirmation: true,
                            impactedAppointments: [
                                {
                                    id: 92,
                                    date: "2030-10-28",
                                    startTime: "08:00",
                                    endTime: "08:30",
                                    reason: "Fuera del horario propuesto",
                                },
                            ],
                        }),
                        { status: 409, headers: { "Content-Type": "application/json" } },
                    );
                }
                return new Response(
                    JSON.stringify({
                        doctorId: 7,
                        cancelledAppointments: 1,
                        queuedNotifications: 1,
                        cancellationDetails: "Se canceló 1 cita afectada.",
                        message: "El intervalo se eliminó correctamente.",
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } },
                );
            }
            if (options.method === "PATCH") {
                const payload = JSON.parse(options.body);
                window.patchAttempts.push(payload);
                if (!payload.confirmImpact) {
                    return new Response(
                        JSON.stringify({
                            requiresConfirmation: true,
                            impactedAppointments: [
                                {
                                    id: 91,
                                    date: "2030-10-28",
                                    startTime: "08:00",
                                    endTime: "08:30",
                                    reason: "Fuera del horario propuesto",
                                },
                            ],
                        }),
                        { status: 409, headers: { "Content-Type": "application/json" } },
                    );
                }
                window.scheduleBlock = { ...window.scheduleBlock, ...payload.blocks[0] };
                return new Response(
                    JSON.stringify({
                        doctorId: 7,
                        cancelledAppointments: 1,
                        queuedNotifications: 1,
                        cancellationDetails:
                            "Se canceló 1 cita afectada. Notificaciones encoladas: 1.",
                        message: "El horario se actualizó correctamente.",
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } },
                );
            }
            const isWeekly = String(url).includes("/week?");
            const payload = isWeekly
                ? {
                      doctor: { id: 7, name: "Dra. Ana Torres", specialty: "Medicina General" },
                      appointmentDurationMinutes: 30,
                      workingDays: [
                          {
                              dayLabel: "Lunes",
                              intervals: [
                                  {
                                      startTime: window.scheduleBlock.startTime,
                                      endTime: window.scheduleBlock.endTime,
                                  },
                              ],
                          },
                      ],
                      availabilityBlocks: [window.scheduleBlock],
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
                          events:
                              index === 0
                                  ? [
                                        {
                                            id: window.scheduleBlock.id,
                                            scheduleId: window.scheduleBlock.id,
                                            dayOfWeek: 1,
                                            validFrom: window.scheduleBlock.validFrom,
                                            validUntil: window.scheduleBlock.validUntil,
                                            type: "available",
                                            label: "Disponible",
                                            startTime: window.scheduleBlock.startTime,
                                            endTime: window.scheduleBlock.endTime,
                                        },
                                    ]
                                  : [],
                      })),
                  }
                : {
                      summary: {
                          activeDoctors: 1,
                          configuredSchedules: 1,
                          upcomingExceptions: 0,
                          affectedAppointments: 0,
                      },
                      doctors: [
                          {
                              id: 7,
                              name: "Dra. Ana Torres",
                              email: "ana@saludvital.co",
                              specialty: { name: "Medicina General" },
                              isActive: true,
                              availability: [window.scheduleBlock],
                          },
                      ],
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
    await page.locator("[data-schedule-doctor-list] [data-edit-schedule]").click();
    await page.locator("[data-schedule-config-dialog]").waitFor({ state: "visible" });
    assert.equal(await page.locator("[data-config-title]").textContent(), "Editar horario");
    await page.locator("[data-config-close]").click();

    await page.locator("[data-schedule-doctor]").selectOption("7");
    await page.locator("[data-weekly-grid] [data-edit-schedule]").waitFor();
    await page.locator("[data-weekly-grid] [data-edit-schedule]").click();
    await page.locator("[data-schedule-config-dialog]").waitFor({ state: "visible" });
    assert.equal(await page.locator("[data-config-title]").textContent(), "Editar horario");
    await page.locator("[data-config-close]").click();

    await page.locator("[data-weekly-editable-blocks] button").waitFor();
    await page.locator("[data-weekly-editable-blocks] button").click();
    await page.locator("[data-schedule-config-dialog]").waitFor({ state: "visible" });
    assert.equal(await page.locator("[data-config-title]").textContent(), "Editar horario");
    assert.equal(await page.locator("[data-config-valid-from]").inputValue(), "2026-01-01");
    assert.equal(await page.locator("[data-day-enabled]").isChecked(), true);
    assert.equal(await page.locator("[data-interval-start]").inputValue(), "08:00");
    assert.equal(await page.locator("[data-interval-end]").inputValue(), "12:00");

    await page.locator("[data-interval-start]").fill("07:00");
    await page.locator("[data-config-day='1'] [data-add-interval]").click();
    const intervalStarts = page.locator("[data-interval-start]");
    const intervalEnds = page.locator("[data-interval-end]");
    await intervalStarts.nth(1).fill("13:00");
    await intervalEnds.nth(1).fill("17:00");
    await page.locator("[data-config-submit]").click();
    await page.locator("[data-config-impact]:visible").waitFor();
    assert.match(await page.locator("[data-config-impact-list]").textContent(), /Cita #91/);
    await page.locator("[data-config-submit]").click();
    await page.locator("[data-schedule-config-dialog]").waitFor({ state: "hidden" });
    await page.locator("[data-config-page-feedback]:visible").waitFor();
    assert.match(
        await page.locator("[data-config-page-feedback]").textContent(),
        /Se canceló 1 cita afectada/,
    );
    const attempts = await page.evaluate(() => window.patchAttempts);
    assert.equal(attempts.length, 2);
    assert.equal(attempts[1].confirmImpact, true);
    assert.equal(attempts[1].blocks[0].startTime, "07:00");
    assert.equal(attempts[1].blocks[1].startTime, "13:00");
    assert.equal(attempts[1].blocks[1].endTime, "17:00");
    assert.match(await page.locator("[data-weekly-editable-blocks]").textContent(), /7:00/);
    console.log(
        "PASS: editor prefills existing values, confirms affected appointments, and saves the proposed interval.",
    );

    for (const viewport of [
        { width: 375, height: 812 },
        { width: 768, height: 1024 },
        { width: 1440, height: 900 },
    ]) {
        await page.setViewportSize(viewport);
        await page.locator("[data-weekly-editable-blocks] button").click();
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
            `PASS: schedule editor has no horizontal overflow at ${viewport.width}x${viewport.height}.`,
        );
    }

    await page.locator("[data-weekly-editable-blocks] button").click();
    await page.locator("[data-config-delete]:visible").click();
    await page.locator("[data-config-impact]:visible").waitFor();
    assert.match(await page.locator("[data-config-impact-list]").textContent(), /Cita #92/);
    assert.match(await page.locator("[data-config-submit]").textContent(), /Confirmar eliminación/);
    await page.locator("[data-config-submit]").click();
    await page.locator("[data-schedule-config-dialog]").waitFor({ state: "hidden" });
    assert.match(
        await page.locator("[data-config-page-feedback]").textContent(),
        /intervalo se eliminó/,
    );
    const deleteAttempts = await page.evaluate(() => window.deleteAttempts);
    assert.equal(deleteAttempts.length, 2);
    assert.equal(deleteAttempts[1].confirmImpact, true);
    console.log(
        "PASS: interval deletion requires explicit confirmation and reviews affected appointments before cancellation.",
    );
} finally {
    await browser.close();
}
