import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

const script = await readFile(path.resolve("public/js/doctor-agenda.js"), "utf8");
const consultationScript = await readFile(
    path.resolve("public/js/doctor-consultation-start.js"),
    "utf8",
);
const styles = await readFile(path.resolve("public/css/doctor-agenda.css"), "utf8");
const patientStyles = await readFile(path.resolve("public/css/patient-dashboard.css"), "utf8");
const doctorStyles = await readFile(path.resolve("public/css/doctor-dashboard.css"), "utf8");
const appStyles = await readFile(path.resolve("public/css/app.css"), "utf8");
const html = `
<body class="sv-dashboard doctor-home-page patient-home-page"><div class="sv-layout"><div class="sv-main"><main class="doctor-content doctor-agenda-page" data-doctor-agenda data-agenda-api-url="/api/doctor/agenda" data-start-consultation-url="/api/doctor/appointments" data-active-consultation-url="/api/doctor/consultations/active" data-today-date="2026-10-29" data-initial-view="day">
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
    </section><aside class="doctor-agenda-aside" data-agenda-aside><section class="doctor-panel doctor-agenda-next-card"><header class="doctor-panel-heading"><h2>Próxima cita</h2><a class="doctor-agenda-view-all" href="/doctor/appointments">Ver todas</a></header><div data-agenda-next-appointment></div></section><div class="doctor-agenda-availability-cards" data-agenda-availability-cards><section class="doctor-panel"><div data-agenda-availability="today"></div></section><section class="doctor-panel"><div data-agenda-availability="week"></div></section><section class="doctor-panel"><div data-agenda-availability="month"></div></section></div></aside>
  </div><dialog data-start-consultation-dialog><span data-start-consultation-patient></span><span data-start-consultation-time></span><span data-start-consultation-reason></span><p data-start-consultation-feedback></p><button type="button" data-close-start-consultation>Volver</button><button type="button" data-confirm-start-consultation>Iniciar consulta</button></dialog><dialog aria-labelledby="active-consultation-title" data-active-consultation-dialog><h2 id="active-consultation-title">Consulta en curso detectada</h2><p data-active-consultation-feedback role="status"></p><button type="button" data-stay-in-agenda>Permanecer en la agenda</button><a data-open-active-consultation-link>Ir a la consulta abierta</a></dialog>
</main></div></div></body>`;

const browser = await chromium.launch({ headless: true });

try {
    await mkdir("test-results", { recursive: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
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
        window.activeConsultationId = null;
        const createAvailability = (hasSchedule = true, selectedDate = "2026-10-29") => {
            const selected = new Date(`${selectedDate}T00:00:00.000Z`);
            const weekStart = new Date(selected);
            weekStart.setUTCDate(selected.getUTCDate() - ((selected.getUTCDay() + 6) % 7));
            const weekEnd = new Date(weekStart);
            weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
            const monthStart = new Date(
                Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1),
            );
            const monthEnd = new Date(
                Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth() + 1, 0),
            );
            const formatDate = (date) => date.toISOString().slice(0, 10);
            const selectedScheduleDay = hasSchedule
                ? [
                      {
                          date: selectedDate,
                          workingPeriods: ["9:00 a. m. – 1:00 p. m."],
                          exceptions: [],
                      },
                  ]
                : [];
            return {
                appointmentDurationMinutes: 30,
                today: {
                    startDate: "2026-10-29",
                    endDate: "2026-10-29",
                    capacitySlots: hasSchedule ? 8 : 0,
                    bookedSlots: hasSchedule ? 3 : 0,
                    availableSlots: hasSchedule ? 5 : 0,
                    hasSchedule,
                    days: hasSchedule
                        ? [
                              {
                                  date: "2026-10-29",
                                  workingPeriods: ["7:00 a. m. – 11:00 a. m."],
                                  exceptions: [
                                      {
                                          label: "Horario no disponible",
                                          startTime: "9:00 a. m.",
                                          endTime: "9:30 a. m.",
                                          allDay: false,
                                      },
                                  ],
                              },
                          ]
                        : [],
                },
                week: {
                    startDate: formatDate(weekStart),
                    endDate: formatDate(weekEnd),
                    capacitySlots: hasSchedule ? 40 : 0,
                    bookedSlots: hasSchedule ? 15 : 0,
                    availableSlots: hasSchedule ? 25 : 0,
                    hasSchedule,
                    days: selectedScheduleDay,
                },
                month: {
                    startDate: formatDate(monthStart),
                    endDate: formatDate(monthEnd),
                    capacitySlots: hasSchedule ? 160 : 0,
                    bookedSlots: hasSchedule ? 60 : 0,
                    availableSlots: hasSchedule ? 100 : 0,
                    hasSchedule,
                    days: selectedScheduleDay,
                },
            };
        };
        window.fetch = async (url) => {
            if (String(url).includes("/api/doctor/consultations/active")) {
                return {
                    ok: true,
                    json: async () => ({ consultationId: window.activeConsultationId }),
                };
            }
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
                        availability: createAvailability(true, date),
                        nextAppointment: {
                            id: 7,
                            patientName: "Ana Pérez",
                            reason: "Medicina General",
                            dateLabel: "30 de octubre",
                            timeLabel: "9:00 a. m.",
                            status: "Confirmed",
                            canStart: true,
                        },
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
                        availability: createAvailability(true, date),
                        nextAppointment: {
                            id: 7,
                            patientName: "Ana Pérez",
                            reason: "Medicina General",
                            dateLabel: "30 de octubre",
                            timeLabel: "9:00 a. m.",
                            status: "Confirmed",
                            canStart: true,
                        },
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
                        nextAppointment: null,
                        availability: createAvailability(false, date),
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
                    nextAppointment: {
                        id: 7,
                        patientName: "Ana Pérez",
                        reason: "Medicina General",
                        dateLabel: "30 de octubre",
                        timeLabel: "9:00 a. m.",
                        status: "Confirmed",
                        canStart: true,
                    },
                    availability: createAvailability(true, date),
                    timeline: { startHour: 7, endHour: 17 },
                }),
            };
        };
        const scriptElement = document.createElement("script");
        scriptElement.textContent = source;
        document.body.append(scriptElement);
    }, script);
    await page.addScriptTag({ content: consultationScript });

    await page.getByText("Ana PÃ©rez").waitFor();
    await page.locator("[data-agenda-next-appointment]").getByText("Ana Pérez").waitFor();
    await page.getByRole("link", { name: "Ver todas" }).waitFor();
    await page.getByRole("button", { name: "Iniciar consulta" }).click();
    await page.locator("[data-start-consultation-dialog]").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Volver" }).click();
    await page.evaluate(() => {
        window.activeConsultationId = 88;
    });
    await page.getByRole("button", { name: "Iniciar consulta" }).click();
    await page.getByText("Consulta en curso detectada").waitFor();
    assert.equal(
        await page.locator("[data-open-active-consultation-link]").getAttribute("href"),
        "/doctor/consultations/88",
    );
    const activeConsultationAccessibility = await new AxeBuilder({ page })
        .include("[data-active-consultation-dialog]")
        .analyze();
    assert.deepEqual(activeConsultationAccessibility.violations, []);
    await page.getByRole("button", { name: "Permanecer en la agenda" }).click();
    await page.locator("[data-active-consultation-dialog]").waitFor({ state: "hidden" });
    assert.equal(await page.locator("[data-agenda-availability]").count(), 3);
    assert.equal(
        await page.locator('[data-agenda-availability="today"] dd').first().textContent(),
        "8",
    );
    await page.locator(".doctor-agenda-availability-details summary").first().click();
    await page.getByText("Horario no disponible: 9:00 a. m. – 9:30 a. m.").waitFor();
    await page.locator('[data-agenda-availability="week"] summary').click();
    await page
        .locator('[data-agenda-availability="week"]')
        .getByText("jueves, 29 de octubre de 2026")
        .waitFor();
    assert.equal(await page.getByText("Editar").count(), 0);
    const availabilityAccessibility = await new AxeBuilder({ page })
        .include("[data-agenda-availability-cards]")
        .analyze();
    assert.deepEqual(availabilityAccessibility.violations, []);
    await page.locator("[data-agenda-availability-cards]").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/doctor-agenda-availability-mobile.png" });
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
    await page
        .locator('[data-agenda-availability="week"]')
        .getByText("Del 02 nov 2026 al 08 nov 2026")
        .waitFor();
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
        { width: 760, height: 1024 },
        { width: 762, height: 1024 },
        { width: 768, height: 1024 },
        { width: 856, height: 1024 },
        { width: 900, height: 1024 },
        { width: 988, height: 1024 },
        { width: 1000, height: 1024 },
        { width: 1024, height: 768 },
        { width: 1366, height: 768 },
    ]) {
        await page.setViewportSize(viewport);
        assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            true,
        );
        if (viewport.width === 390) {
            const hourLabelLayouts = await page
                .locator(".doctor-agenda-hour-label")
                .evaluateAll((labels) =>
                    labels.map((label) => ({
                        whiteSpace: getComputedStyle(label).whiteSpace,
                        scrollWidth: label.scrollWidth,
                        clientWidth: label.clientWidth,
                    })),
                );
            assert.ok(
                hourLabelLayouts.every(
                    ({ whiteSpace, scrollWidth, clientWidth }) =>
                        whiteSpace === "nowrap" && scrollWidth <= clientWidth + 1,
                ),
                JSON.stringify(hourLabelLayouts),
            );
            const selectorBounds = await page.locator(".doctor-agenda-view-switcher").boundingBox();
            const panelBounds = await page
                .locator("[data-agenda-calendar] .doctor-panel-heading")
                .boundingBox();
            assert.ok(
                selectorBounds.y + selectorBounds.height <= panelBounds.y,
                JSON.stringify({ selectorBounds, panelBounds }),
            );
        }
        if (viewport.width >= 856 && viewport.width <= 1000) {
            const agendaBounds = await page.evaluate(() => {
                const box = (element) => {
                    const { left, right, top, bottom } = element.getBoundingClientRect();
                    return { left, right, top, bottom };
                };
                const toolbar = document.querySelector(".doctor-agenda-toolbar");
                const toolbarBox = box(toolbar);
                const toolbarControls = Array.from(
                    toolbar.querySelectorAll(
                        ":scope > button, :scope > label, :scope > .doctor-agenda-view-switcher",
                    ),
                ).map(box);
                const content = document.querySelector(".doctor-content");
                const contentBox = box(content);
                const panels = Array.from(
                    document.querySelectorAll(
                        ".doctor-agenda-calendar, .doctor-agenda-aside, .doctor-agenda-next-card, .doctor-agenda-availability-card",
                    ),
                )
                    .filter((element) => element.getClientRects().length)
                    .map(box);
                const availabilityCards = Array.from(
                    document.querySelectorAll(".doctor-agenda-availability-card"),
                ).map((card) => ({
                    card: box(card),
                    content: Array.from(
                        card.querySelectorAll(
                            ".doctor-agenda-availability-period, .doctor-agenda-availability-metric, .doctor-agenda-availability-metric dt, .doctor-agenda-availability-metric dd, .doctor-agenda-availability-details summary",
                        ),
                    ).map((element) => ({
                        ...box(element),
                        scrollWidth: element.scrollWidth,
                        clientWidth: element.clientWidth,
                    })),
                }));
                return { toolbarBox, toolbarControls, contentBox, panels, availabilityCards };
            });
            assert.ok(
                agendaBounds.toolbarBox.left >= agendaBounds.contentBox.left &&
                    agendaBounds.toolbarBox.right <= agendaBounds.contentBox.right,
                JSON.stringify({ width: viewport.width, ...agendaBounds }),
            );
            assert.ok(
                agendaBounds.toolbarControls.every(
                    ({ left, right, top, bottom }) =>
                        left >= agendaBounds.toolbarBox.left &&
                        right <= agendaBounds.toolbarBox.right &&
                        top >= agendaBounds.toolbarBox.top &&
                        bottom <= agendaBounds.toolbarBox.bottom,
                ),
                JSON.stringify({ width: viewport.width, ...agendaBounds }),
            );
            assert.ok(
                agendaBounds.panels.every(
                    ({ left, right }) =>
                        left >= agendaBounds.contentBox.left &&
                        right <= agendaBounds.contentBox.right,
                ),
                JSON.stringify({ width: viewport.width, ...agendaBounds }),
            );
            assert.ok(
                agendaBounds.availabilityCards.every(({ card, content }) =>
                    content.every(
                        ({ left, right, scrollWidth, clientWidth }) =>
                            left >= card.left &&
                            right <= card.right &&
                            scrollWidth <= clientWidth + 1,
                    ),
                ),
                JSON.stringify({ width: viewport.width, ...agendaBounds }),
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
    await page
        .locator('[data-agenda-availability="today"]')
        .getByText("No hay horario disponible configurado para este período.")
        .waitFor();
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
