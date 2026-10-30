import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const script = await readFile(path.resolve("public/js/doctor-agenda.js"), "utf8");
const styles = await readFile(path.resolve("public/css/doctor-agenda.css"), "utf8");
const html = `
    <main class="doctor-agenda-page" data-doctor-agenda data-agenda-api-url="/api/doctor/agenda" data-today-date="2026-10-29">
        <header class="doctor-page-heading doctor-agenda-heading"><h1>Mi agenda</h1><p>Visualiza tus citas y el horario configurado para el día.</p></header>
        <section class="doctor-agenda-toolbar"><button data-agenda-previous>Anterior</button><label class="doctor-agenda-date-label"><input type="date" value="2026-10-29" data-agenda-date></label><button data-agenda-today>Hoy</button><button data-agenda-next>Siguiente</button></section>
        <p data-agenda-feedback hidden></p><div class="doctor-agenda-layout">
            <section class="doctor-panel doctor-agenda-calendar" data-agenda-calendar><header class="doctor-panel-heading"><h2 data-agenda-title></h2></header><div data-agenda-loading>Cargando…</div><div class="doctor-agenda-timeline" data-agenda-timeline hidden></div><div data-agenda-empty hidden><h3 data-agenda-empty-title></h3><p data-agenda-empty-message></p></div></section>
            <aside class="doctor-agenda-aside"><section class="doctor-panel"><ul data-agenda-periods></ul></section><section class="doctor-panel"><ul data-agenda-exceptions></ul></section></aside>
        </div>
    </main>`;

const browser = await chromium.launch({ headless: true });

try {
    await mkdir("test-results", { recursive: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(html);
    await page.addStyleTag({ content: styles });
    await page.addStyleTag({
        content:
            ".doctor-home-page{--doctor-primary:#123b73;--doctor-border:#e2edf8}.doctor-content{display:grid;padding:12px}.doctor-panel{border:1px solid #e2edf8;border-radius:12px;background:#fff}.doctor-panel-heading{padding:14px}.doctor-page-heading h1{color:#102f85}.doctor-eyebrow{font-size:10px}.doctor-patient-avatar{display:grid;place-items:center;border-radius:50%;background:#e5f3ff}.doctor-status{padding:4px 7px;border-radius:99px;background:#d9f7e8;font-size:10px}",
    });
    await page.addStyleTag({
        content:
            "*,*::before,*::after{box-sizing:border-box}html,body{margin:0;font-family:Arial,sans-serif;color:#123b73;background:#f4f9ff}.doctor-agenda-page{max-width:1100px;margin:auto}",
    });
    await page.evaluate((source) => {
        window.agendaRequestedDates = [];
        window.agendaMode = "success";
        window.fetch = async (url) => {
            const date = new URL(url, "http://localhost").searchParams.get("date");
            window.agendaRequestedDates.push(date);
            if (window.agendaMode === "error") {
                return {
                    ok: false,
                    json: async () => ({ message: "No pudimos cargar la agenda." }),
                };
            }
            if (window.agendaMode === "empty") {
                return {
                    ok: true,
                    json: async () => ({
                        selectedDate: date,
                        dateLabel: "jueves, 29 de octubre de 2026",
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
                    dateLabel: "jueves, 29 de octubre de 2026",
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
                            patientName: "Ana Pérez",
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

    await page.getByText("Ana Pérez").waitFor();
    assert.equal(await page.locator(".doctor-agenda-appointment").count(), 1);
    assert.ok(
        (await page
            .locator(".doctor-agenda-appointment")
            .evaluate((element) => element.getBoundingClientRect().height)) <= 40,
    );
    assert.equal(
        await page.locator(".doctor-agenda-appointment").getAttribute("href"),
        "/doctor/appointments?startDate=2026-10-29&endDate=2026-10-29",
    );
    await page.locator("[data-agenda-next]").click();
    await page.waitForFunction(() => window.agendaRequestedDates.at(-1) === "2026-10-30");
    await page.waitForTimeout(50);
    await page.locator(".doctor-agenda-appointment").waitFor({ state: "visible" });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.screenshot({ path: "test-results/doctor-agenda-tablet.png", fullPage: true });
    assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
    );
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.screenshot({ path: "test-results/doctor-agenda-desktop.png", fullPage: true });
    assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/doctor-agenda-mobile.png", fullPage: true });
    await page.locator("[data-agenda-previous]").focus();
    await page.keyboard.press("Tab");
    assert.equal(
        await page.evaluate(() => document.activeElement.matches("[data-agenda-date]")),
        true,
    );
    await page.evaluate(() => {
        window.agendaMode = "empty";
    });
    await page.locator("[data-agenda-next]").click();
    await page.waitForFunction(
        () =>
            window.agendaRequestedDates.at(-1) === "2026-10-31" &&
            !document.querySelector("[data-agenda-empty]").hidden,
    );
    await page.evaluate(() => {
        window.agendaMode = "error";
    });
    await page.locator("[data-agenda-next]").click();
    await page.getByText("No pudimos cargar la agenda.").waitFor();
    assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
    );

    console.log("Doctor agenda browser flow passed at mobile, tablet, and desktop viewports.");
} finally {
    await browser.close();
}
