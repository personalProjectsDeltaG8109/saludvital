import path from "node:path";
import pug from "pug";
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";

const viewPath = path.resolve("views/admin/appointment-details.pug");
const markup = pug.renderFile(viewPath, {
    pageTitle: "Cita 10 | SaludVital",
    adminName: "Administradora",
    appointment: {
        id: 10,
        startAt: "2026-10-26T15:30:00.000Z",
        endAt: "2026-10-26T16:00:00.000Z",
        patient: { id: 5, name: "María Fernanda López", photoUrl: null },
        specialty: "Medicina General",
        doctor: "Dra. Ana Torres",
        status: "Confirmed",
        statusLabel: "Confirmada",
    },
});
const dashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const appointmentsStyles = await readFile(
    path.resolve("public/css/admin-appointments.css"),
    "utf8",
);
const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.setContent(markup, { waitUntil: "domcontentloaded" });
    await page.addStyleTag({ content: dashboardStyles });
    await page.addStyleTag({ content: appointmentsStyles });
    await page.getByRole("heading", { name: "Detalle de cita" }).waitFor();
    await page.getByText("María Fernanda López").waitFor();
    await page.getByText("Dra. Ana Torres").waitFor();
    await page.getByText("Confirmada", { exact: true }).waitFor();
    await page.getByRole("link", { name: /Volver a citas/ }).waitFor();

    for (const viewport of [
        { label: "mobile", width: 375, height: 812 },
        { label: "tablet", width: 768, height: 1024 },
        { label: "desktop", width: 1440, height: 900 },
    ]) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const layout = await page.evaluate(() => ({
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
            text: document.querySelector("main").innerText,
        }));
        if (layout.documentWidth > layout.viewportWidth) {
            throw new Error(
                "Appointment details overflows at " +
                    viewport.label +
                    ": " +
                    JSON.stringify(layout),
            );
        }
        if (/pendiente/i.test(layout.text)) {
            throw new Error("The appointment details page must only display supported statuses.");
        }
        console.log(
            "PASS: appointment details at " +
                viewport.label +
                " (" +
                viewport.width +
                "x" +
                viewport.height +
                ").",
        );
    }
} finally {
    await browser.close();
}
