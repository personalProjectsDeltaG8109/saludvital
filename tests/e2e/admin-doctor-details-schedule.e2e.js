import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import pug from "pug";
import { chromium } from "playwright";

const stylesheetPaths = [
    "public/css/app.css",
    "public/css/admin-dashboard.css",
    "public/css/admin-doctors.css",
];
const stylesheets = await Promise.all(
    stylesheetPaths.map((filePath) => readFile(filePath, "utf8")),
);
const html = pug.renderFile("views/admin/doctor-details.pug", {
    pageTitle: "Dra. Ejemplo | Médicos SaludVital",
    adminName: "Administración de prueba",
    doctor: {
        id: 12,
        userId: 7,
        name: "Dra. Ejemplo",
        email: "doctor@example.com",
        specialty: { id: 3, name: "Medicina General" },
        profilePhotoUrl: null,
        isActive: true,
        createdAt: new Date("2026-01-01T12:00:00.000Z"),
        lastLoginAt: null,
        professionalInformation: null,
        hasSchedule: true,
        currentSchedule: [
            {
                dayOfWeek: 1,
                day: "Lunes",
                intervals: [
                    { id: 1, timeRange: "8:00 a. m. – 12:00 p. m." },
                    { id: 2, timeRange: "1:00 p. m. – 5:00 p. m." },
                ],
            },
            ...["Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map(
                (day, index) => ({ dayOfWeek: index + 2, day, intervals: [] }),
            ),
        ],
        upcomingSchedule: [
            {
                dayOfWeek: 2,
                day: "Martes",
                periods: [
                    {
                        validityLabel: "Desde 30 nov 2026",
                        status: "Programado",
                        intervals: [{ id: 3, timeRange: "9:00 a. m. – 12:00 p. m." }],
                    },
                ],
            },
        ],
        previousSchedule: [
            {
                dayOfWeek: 3,
                day: "Miércoles",
                periods: [
                    {
                        validityLabel: "Desde 1 oct 2026",
                        status: "Inactivo",
                        intervals: [{ id: 4, timeRange: "8:00 a. m. – 9:00 a. m." }],
                    },
                ],
            },
        ],
    },
});

const browser = await chromium.launch({ headless: true });

try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await page.setContent(html);
    for (const stylesheet of stylesheets) {
        await page.addStyleTag({ content: stylesheet });
    }

    const activeWeek = page.locator(".doctor-schedule-week");
    assert.equal(await activeWeek.locator(":scope > .doctor-schedule-day").count(), 7);
    assert.equal(
        await activeWeek.locator(".doctor-schedule-day-name strong", { hasText: "Lunes" }).count(),
        1,
    );
    assert.deepEqual(await activeWeek.locator(".doctor-schedule-time").allTextContents(), [
        "8:00 a. m. – 12:00 p. m.",
        "1:00 p. m. – 5:00 p. m.",
    ]);

    const upcomingSchedule = page.locator("details").filter({ hasText: "Próximos horarios" });
    await upcomingSchedule.locator("summary").focus();
    await page.keyboard.press("Enter");
    await assert.equal(await upcomingSchedule.getAttribute("open"), "");
    assert.equal(await upcomingSchedule.locator(".doctor-schedule-period-day h3").count(), 1);

    const accessibility = await new AxeBuilder({ page })
        .include(".doctor-schedule-card")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
    assert.deepEqual(
        accessibility.violations.map(({ id, impact }) => ({ id, impact })),
        [],
        JSON.stringify(
            accessibility.violations.map(({ id, nodes }) => ({
                id,
                nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
            })),
        ),
    );

    for (const width of [320, 390, 760, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const layout = await page.evaluate(() => ({
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
        }));
        assert.ok(
            layout.documentWidth <= layout.viewportWidth,
            `Doctor detail layout overflows at ${width}px: ${JSON.stringify(layout)}`,
        );
    }

    console.log(
        "PASS: doctor schedule groups intervals by day and opens future periods by keyboard.",
    );
    console.log(
        "PASS: doctor schedule section has no axe WCAG A/AA findings or responsive overflow.",
    );
} finally {
    await browser.close();
}
