import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const script = await readFile(path.resolve("public/js/doctor-agenda.js"), "utf8");
const styles = await readFile(path.resolve("public/css/doctor-agenda.css"), "utf8");
const patientStyles = await readFile(path.resolve("public/css/patient-dashboard.css"), "utf8");
const doctorStyles = await readFile(path.resolve("public/css/doctor-dashboard.css"), "utf8");
const appStyles = await readFile(path.resolve("public/css/app.css"), "utf8");
const html = `
<body class="sv-dashboard doctor-home-page patient-home-page"><div class="sv-layout"><div class="sv-main"><main class="doctor-content doctor-agenda-page" data-doctor-agenda data-agenda-api-url="/api/doctor/agenda" data-today-date="2026-10-29" data-initial-view="day">
  <header class="doctor-page-heading doctor-agenda-heading"><div><p class="doctor-eyebrow">Agenda medica</p><h1>Mi agenda</h1></div></header>
  <section class="doctor-agenda-toolbar" aria-label="Navegacion de fecha">
    <button class="doctor-agenda-nav-button" aria-label="Anterior" data-agenda-previous><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg></button><label class="doctor-agenda-date-label"><input type="date" value="2026-10-29" data-agenda-date></label><button class="doctor-agenda-today" data-agenda-today>Hoy</button><button class="doctor-agenda-nav-button" aria-label="Siguiente" data-agenda-next><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg></button>
    <div class="doctor-agenda-view-switcher" role="group" aria-label="Vista de agenda"><button class="doctor-agenda-view-button" data-agenda-view="day">Dia</button><button class="doctor-agenda-view-button" data-agenda-view="week">Semana</button><button class="doctor-agenda-view-button" data-agenda-view="month">Mes</button></div>
  </section>
  <p data-agenda-feedback hidden></p><div class="doctor-agenda-layout">
    <section class="doctor-panel doctor-agenda-calendar" data-agenda-calendar><header class="doctor-panel-heading"><div><p class="doctor-eyebrow" data-agenda-eyebrow></p><h2 data-agenda-title></h2></div></header><div data-agenda-loading>Cargando</div><div class="doctor-agenda-timeline" data-agenda-timeline hidden></div>
      <div class="doctor-agenda-empty" data-agenda-empty hidden><h3 data-agenda-empty-title></h3><p data-agenda-empty-message></p></div>
      <div class="doctor-agenda-period-view doctor-agenda-week-view" data-agenda-week-view hidden><h3 data-agenda-week-title></h3><div class="doctor-agenda-week-grid" data-agenda-week-grid></div></div>
      <div class="doctor-agenda-period-view doctor-agenda-month-view" data-agenda-month-view hidden><h3 data-agenda-month-title></h3><div class="doctor-agenda-month-grid" data-agenda-month-grid></div><p data-agenda-month-empty hidden>No hay citas confirmadas para este mes.</p></div>
    </section><aside class="doctor-agenda-aside" data-agenda-aside><section class="doctor-panel"><ul data-agenda-periods></ul></section><section class="doctor-panel"><ul data-agenda-exceptions></ul></section></aside>
  </div>
</main></div></div></body>`;

const browser = await chromium.launch({ headless: true });

try {
    await mkdir("test-results", { recursive: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(html);
    await page.addStyleTag({ content: appStyles });
    await page.addStyleTag({ content: patientStyles });
    await page.addStyleTag({ content: doctorStyles });
    await page.addStyleTag({ content: styles });
    await page.addStyleTag({
        content:
            "html,body{margin:0;font-family:Arial,sans-serif;color:#123b73;background:#f4f9ff}.doctor-home-page{--doctor-primary:#123b73;--doctor-border:#e2edf8}.doctor-patient-avatar{display:grid;place-items:center;border-radius:50%;background:#e5f3ff}",
    });
    await page.evaluate((source) => {
        window.agendaRequests = [];
        window.agendaMode = "success";
        window.fetch = async (url) => {
            const query = new URL(url, "http://localhost").searchParams;
            const date = query.get("date");
            const view = query.get("view");
            window.agendaRequests.push({ date, view });
            if (window.agendaMode === "error") {
                return {
                    ok: false,
                    json: async () => ({ message: "No pudimos cargar la agenda." }),
                };
            }
            if (view === "week") {
                const selected = new Date(`${date}T00:00:00.000Z`);
                const monday = new Date(selected);
                monday.setUTCDate(selected.getUTCDate() - ((selected.getUTCDay() + 6) % 7));
                const days = Array.from({ length: 7 }, (_, index) => {
                    const current = new Date(monday);
                    current.setUTCDate(monday.getUTCDate() + index);
                    const dayDate = current.toISOString().slice(0, 10);
                    return {
                        date: dayDate,
                        dateLabel: dayDate,
                        appointments:
                            dayDate === "2026-10-29"
                                ? [
                                      {
                                          id: 1,
                                          patientName: "Ana PÃ©rez",
                                          reason: "Medicina General",
                                          statusLabel: "Confirmada",
                                          startTime: "8:00 a. m.",
                                      },
                                  ]
                                : [],
                    };
                });
                return {
                    ok: true,
                    json: async () => ({
                        view,
                        selectedDate: date,
                        rangeStart: days[0].date,
                        rangeEnd: days[6].date,
                        periodLabel: "26 oct - 1 nov",
                        days,
                    }),
                };
            }
            if (view === "month") {
                const days = Array.from({ length: 31 }, (_, index) => ({
                    date: `2026-10-${String(index + 1).padStart(2, "0")}`,
                    dayNumber: index + 1,
                    appointmentCount: index === 28 ? 2 : 0,
                    isToday: index === 28,
                }));
                return {
                    ok: true,
                    json: async () => ({
                        view,
                        selectedDate: date,
                        rangeStart: "2026-10-01",
                        rangeEnd: "2026-10-31",
                        periodLabel: "octubre de 2026",
                        days,
                    }),
                };
            }
            if (window.agendaMode === "empty") {
                return {
                    ok: true,
                    json: async () => ({
                        selectedDate: date,
                        dateLabel: date,
                        workingPeriods: [],
                        exceptions: [],
                        appointments: [],
                        timeline: null,
                    }),
                };
            }
            return {
                ok: true,
                json: async () => ({
                    selectedDate: date,
                    dateLabel: date,
                    workingPeriods: [
                        {
                            startMinute: 420,
                            endMinute: 1020,
                            startTime: "7:00 a. m.",
                            endTime: "5:00 p. m.",
                        },
                    ],
                    exceptions: [],
                    appointments: [
                        {
                            id: 1,
                            patientName: "Ana PÃ©rez",
                            patientPhotoUrl: null,
                            reason: "Medicina General",
                            status: "Confirmed",
                            statusLabel: "Confirmada",
                            startMinute: 480,
                            endMinute: 510,
                            startTime: "8:00 a. m.",
                            endTime: "8:30 a. m.",
                        },
                    ],
                    timeline: { startHour: 7, endHour: 17 },
                }),
            };
        };
        const scriptElement = document.createElement("script");
        scriptElement.textContent = source;
        document.body.append(scriptElement);
    }, script);

    await page.getByText("Ana PÃ©rez").waitFor();
    assert.equal(await page.locator("[data-agenda-view]").count(), 3);
    assert.equal(await page.locator(".doctor-agenda-appointment").count(), 1);
    assert.equal(
        await page.locator(".doctor-agenda-appointment").getAttribute("href"),
        "/doctor/appointments?startDate=2026-10-29&endDate=2026-10-29",
    );
    await page.locator('[data-agenda-view="week"]').click();
    await page.getByText("Sin citas confirmadas").first().waitFor();
    assert.equal(await page.locator("[data-agenda-title]").textContent(), "Agenda semanal");
    assert.equal(await page.locator("[data-agenda-week-title]").count(), 1);
    await page.locator("[data-agenda-next]").click();
    await page.waitForFunction(
        () =>
            window.agendaRequests.at(-1).view === "week" &&
            window.agendaRequests.at(-1).date === "2026-11-05",
    );
    assert.equal(
        await page.locator('[data-agenda-view="week"]').getAttribute("aria-pressed"),
        "true",
    );

    await page.locator('[data-agenda-view="month"]').click();
    await page.locator(".doctor-agenda-month-day.has-appointments").waitFor();
    assert.equal(await page.locator("[data-agenda-title]").textContent(), "Agenda mensual");
    assert.equal(await page.locator("[data-agenda-month-title]").count(), 1);
    await page.locator(".doctor-agenda-month-day.has-appointments").click();
    await page.waitForFunction(
        () =>
            window.agendaRequests.at(-1).view === "day" &&
            window.agendaRequests.at(-1).date === "2026-10-29",
    );
    await page.locator('[data-agenda-view="day"]').click();
    await page.locator("[data-agenda-next]").click();
    await page.waitForFunction(
        () =>
            window.agendaRequests.at(-1).view === "day" &&
            window.agendaRequests.at(-1).date === "2026-10-30",
    );

    for (const viewport of [
        { width: 390, height: 844 },
        { width: 768, height: 1024 },
        { width: 1366, height: 768 },
    ]) {
        await page.setViewportSize(viewport);
        assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            true,
        );
        if (viewport.width === 390) {
            const selectorBounds = await page.locator(".doctor-agenda-view-switcher").boundingBox();
            const panelBounds = await page
                .locator("[data-agenda-calendar] .doctor-panel-heading")
                .boundingBox();
            assert.ok(
                selectorBounds.y + selectorBounds.height <= panelBounds.y,
                JSON.stringify({ selectorBounds, panelBounds }),
            );
        }
        await page.screenshot({
            path: `test-results/doctor-agenda-${viewport.width}.png`,
            fullPage: true,
        });
    }
    for (const view of ["week", "month"]) {
        await page.locator(`[data-agenda-view="${view}"]`).click();
        await page.setViewportSize({ width: 390, height: 844 });
        await page
            .locator(view === "week" ? "[data-agenda-week-title]" : "[data-agenda-month-title]")
            .waitFor({ state: "visible" });
        assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            true,
        );
        const selectorBounds = await page.locator(".doctor-agenda-view-switcher").boundingBox();
        const panelBounds = await page
            .locator("[data-agenda-calendar] .doctor-panel-heading")
            .boundingBox();
        assert.ok(
            selectorBounds.y + selectorBounds.height <= panelBounds.y,
            JSON.stringify({ selectorBounds, panelBounds }),
        );
        await page.screenshot({
            path: `test-results/doctor-agenda-${view}-mobile.png`,
            fullPage: true,
        });
    }
    await page.locator("[data-agenda-previous]").focus();
    await page.keyboard.press("Tab");
    assert.equal(
        await page.evaluate(() => document.activeElement.matches("[data-agenda-date]")),
        true,
    );

    await page.evaluate(() => {
        window.agendaMode = "empty";
    });
    await page.locator('[data-agenda-view="day"]').click();
    await page.locator("[data-agenda-empty]").waitFor({ state: "visible" });
    await page.evaluate(() => {
        window.agendaMode = "error";
    });
    await page.locator("[data-agenda-next]").click();
    await page.getByText("No pudimos cargar la agenda.").waitFor();

    console.log(
        "Doctor agenda day, week, and month browser flows passed at mobile, tablet, and desktop viewports.",
    );
} finally {
    await browser.close();
}
