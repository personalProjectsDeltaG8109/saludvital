import { readFile } from "node:fs/promises";
import path from "node:path";
import pug from "pug";
import { chromium } from "playwright";

const reportHtml = pug.renderFile(path.resolve("views/admin/appointment-export-report.pug"), {
    pageTitle: "Reporte de citas médicas | SaludVital",
    generatedAt: "lunes, 26 de octubre de 2026, 10:30",
    filters: [
        { label: "Estado", value: "Confirmada" },
        { label: "Especialidad", value: "Medicina General" },
        { label: "Paciente", value: "María, ‘Mafe’ López" },
    ],
    appointments: [
        {
            id: 10,
            startAtLabel: "26 oct 2026, 10:30",
            endAtLabel: "26 oct 2026, 11:00",
            patientName: 'María, "Mafe" López',
            specialty: "Medicina General",
            doctor: "Dra. Ana Torres",
            statusLabel: "Confirmada",
        },
    ],
    errorMessage: null,
});
const reportStyles = await readFile(
    path.resolve("public/css/admin-appointment-report.css"),
    "utf8",
);
const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.setContent(reportHtml, { waitUntil: "load" });
    await page.addStyleTag({ content: reportStyles });
    if (!reportHtml.includes('printButton.addEventListener("click", () => window.print())')) {
        throw new Error("The report print control must invoke the browser print dialog.");
    }

    const reportText = await page.locator("body").innerText();
    for (const text of [
        "Reporte de citas médicas",
        "lunes, 26 de octubre de 2026, 10:30",
        "Medicina General",
        'María, "Mafe" López',
        "Confirmada",
    ]) {
        if (!reportText.includes(text)) throw new Error(`The report is missing: ${text}`);
    }
    if (/pendiente/i.test(reportText)) {
        throw new Error("The appointments report must not display the unsupported status.");
    }
    if (/3001234567|private clinical information/.test(reportText)) {
        throw new Error("The report must not expose unrelated sensitive information.");
    }

    await page.emulateMedia({ media: "print" });
    const printLayout = await page.evaluate(() => ({
        headerDisplay: getComputedStyle(document.querySelector(".report-table thead")).display,
        printButtonDisplay: getComputedStyle(document.querySelector(".report-print-button"))
            .display,
        pageNumberRule: Array.from(document.styleSheets).some((sheet) => {
            try {
                return Array.from(sheet.cssRules).some((rule) =>
                    rule.cssText.includes("counter(page)"),
                );
            } catch {
                return false;
            }
        }),
    }));
    if (
        printLayout.headerDisplay !== "table-header-group" ||
        printLayout.printButtonDisplay !== "none"
    ) {
        throw new Error(
            "The report print layout must repeat table headers and hide print controls.",
        );
    }
    const pdfDocument = await page.pdf({ format: "A4", landscape: true, printBackground: true });
    if (pdfDocument.subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw new Error("The browser must be able to render the report as a PDF document.");
    }

    for (const viewport of [
        { width: 375, height: 812 },
        { width: 768, height: 1024 },
        { width: 1440, height: 900 },
    ]) {
        await page.emulateMedia({ media: "screen" });
        await page.setViewportSize(viewport);
        const dimensions = await page.evaluate(() => ({
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
        }));
        if (dimensions.documentWidth > dimensions.viewportWidth) {
            throw new Error(`The report overflows at ${viewport.width}px.`);
        }
    }

    const emptyHtml = pug.renderFile(path.resolve("views/admin/appointment-export-report.pug"), {
        pageTitle: "Reporte de citas médicas | SaludVital",
        generatedAt: "lunes, 26 de octubre de 2026, 10:30",
        filters: [],
        appointments: [],
        errorMessage: null,
    });
    await page.setContent(emptyHtml);
    if (!(await page.getByText("No hay citas para los filtros seleccionados.").count())) {
        throw new Error("The PDF report must explain when no appointments match.");
    }

    console.log(
        "PASS: PDF report content, Spanish characters, privacy, print layout, empty state, and responsive widths.",
    );
} finally {
    await browser.close();
}
