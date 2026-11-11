import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import pug from "pug";
import { chromium } from "playwright";

const stylesheetPaths = [
    "public/css/app.css",
    "public/css/patient-dashboard.css",
    "public/css/doctor-dashboard.css",
];
await mkdir("test-results", { recursive: true });
const stylesheets = await Promise.all(stylesheetPaths.map((path) => readFile(path, "utf8")));
const html = pug.renderFile("views/doctor/appointments.pug", {
    pageTitle: "Mis citas | SaludVital",
    doctorName: "Dra. Ana Ramírez",
    doctorPhotoUrl: null,
    activeNav: "appointments",
    bottomNavActive: "appointments",
    appointmentsPath: "/doctor/appointments",
    appointmentFilters: { startDate: "", endDate: "", search: "", status: "" },
    appointmentTotalCount: 24,
    appointmentCount: 24,
    appointmentPage: 1,
    appointmentPageSize: 10,
    appointmentTotalPages: 3,
    appointmentStatuses: [
        { name: "Confirmed", label: "Confirmadas", summaryLabel: "Confirmadas", count: 12 },
        { name: "Attended", label: "Atendidas", summaryLabel: "Atendidas", count: 8 },
        { name: "Cancelled", label: "Canceladas", summaryLabel: "Canceladas", count: 4 },
    ],
    appointments: [
        {
            id: 1,
            startAt: new Date("2026-11-02T14:00:00.000Z"),
            dateLabel: "lunes, 2 de noviembre de 2026",
            time: "9:00",
            meridiem: "a. m.",
            patientName: "María Camila Ramírez López",
            patientPhotoUrl: null,
            reason: "Consulta general",
            specialty: "Medicina General",
            status: "Confirmed",
            statusKey: "confirmed",
            statusLabel: "Confirmada",
            canStart: false,
            hasActiveConsultation: false,
        },
    ],
});

const pageHtml = `${stylesheets.map((stylesheet) => `<style>${stylesheet}</style>`).join("")}${html}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
    for (const width of [390, 760, 762, 768, 1024, 1366]) {
        await page.setViewportSize({ width, height: 1024 });
        await page.setContent(pageHtml, { waitUntil: "domcontentloaded" });

        const layout = await page.evaluate(() => {
            const cards = [...document.querySelectorAll(".doctor-summary-item")];
            const cardLabels = cards.map((card) => {
                const label = card.querySelector(".doctor-summary-copy small");
                return {
                    text: label?.textContent.trim(),
                    clientWidth: label?.clientWidth ?? 0,
                    scrollWidth: label?.scrollWidth ?? 0,
                    bounds: card.getBoundingClientRect().toJSON(),
                };
            });

            return {
                viewportWidth: window.innerWidth,
                documentWidth: document.documentElement.scrollWidth,
                cardLabels,
                summaryColumns: getComputedStyle(
                    document.querySelector(".doctor-appointment-summary"),
                ).gridTemplateColumns,
            };
        });

        assert.equal(layout.documentWidth, width, `Unexpected horizontal overflow at ${width}px`);
        assert.equal(layout.cardLabels.length, 4, `Expected four summary cards at ${width}px`);

        for (const card of layout.cardLabels) {
            assert.ok(
                card.bounds.left >= 0,
                `Summary card starts outside the viewport at ${width}px`,
            );
            assert.ok(
                card.bounds.right <= width,
                `Summary card ends outside the viewport at ${width}px`,
            );
            assert.ok(
                card.scrollWidth <= card.clientWidth + 1,
                `Summary label is clipped at ${width}px: ${card.text}`,
            );
        }

        if (width >= 761 && width <= 1100) {
            assert.equal(layout.summaryColumns.split(" ").length, 2);
        }

        await page.screenshot({
            path: `test-results/doctor-appointments-responsive-${width}.png`,
            fullPage: true,
        });
        console.log(`PASS: doctor appointment cards fit without clipping at ${width}px.`);
    }

    await page.setViewportSize({ width: 762, height: 1024 });
    const accessibility = await new AxeBuilder({ page })
        .include(".doctor-appointment-summary")
        .analyze();
    assert.deepEqual(
        accessibility.violations.map(({ id, impact, nodes }) => ({
            id,
            impact,
            nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
        })),
        [],
        "Doctor appointment responsive layout must pass axe-core.",
    );

    let focusedCard = false;
    for (let index = 0; index < 24; index += 1) {
        await page.keyboard.press("Tab");
        focusedCard = await page.evaluate(() => {
            const activeElement = document.activeElement;
            return (
                activeElement?.classList.contains("doctor-summary-item") &&
                getComputedStyle(activeElement).outlineStyle !== "none"
            );
        });
        if (focusedCard) break;
    }
    assert.ok(focusedCard, "Summary cards should have a visible keyboard focus indicator.");
    console.log("PASS: doctor appointment cards are keyboard accessible and axe-core clean.");
} finally {
    await context.close();
    await browser.close();
}
