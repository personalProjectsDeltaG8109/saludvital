import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import pug from "pug";
import { chromium } from "playwright";

const markup = pug.renderFile(path.resolve("views/admin/appointments.pug"), {
    pageTitle: "Citas médicas | SaludVital",
    adminName: "Administrador Demo",
});
const demoPatientPhoto = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="40" fill="#e7f5ff"/><path d="M11 80c2-17 13-27 29-27s27 10 29 27" fill="#08b78a"/><path d="M23 31c0-14 7-22 17-22s17 8 17 22v7H23z" fill="#24395b"/><circle cx="40" cy="34" r="14" fill="#f4c29f"/><path d="M25 31c2-13 8-18 15-18s14 5 16 18c-5-3-8-7-10-10-4 5-11 8-21 10" fill="#24395b"/></svg>',
)} `;
const scripts = await readFile(path.resolve("public/js/admin-appointments.js"), "utf8");
const styles = await Promise.all(
    [
        "public/css/app.css",
        "public/css/admin-dashboard.css",
        "public/css/appointment-stat-icons.css",
        "public/css/admin-appointments.css",
    ].map((file) => readFile(path.resolve(file), "utf8")),
);
const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
});

try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    await page.route("http://127.0.0.1:3200/**", async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname.startsWith("/brand/")) {
            try {
                const body = await readFile(path.resolve("public", pathname.slice(1)));
                return route.fulfill({
                    body,
                    contentType: pathname.endsWith(".svg") ? "image/svg+xml" : "image/png",
                });
            } catch {
                return route.fulfill({ status: 404, body: "" });
            }
        }
        return route.fulfill({ contentType: "text/html", body: "<!doctype html><html></html>" });
    });
    await page.goto("http://127.0.0.1:3200");
    await page.setContent(markup, { waitUntil: "domcontentloaded" });
    for (const content of styles) await page.addStyleTag({ content });
    await page.evaluate((photoUrl) => {
        window.fetch = async (url) => {
            const pathname = new URL(url, location.origin).pathname;
            if (pathname === "/api/admin/appointments/10") {
                return {
                    ok: true,
                    headers: { get: () => "application/json; charset=utf-8" },
                    json: async () => ({
                        appointment: {
                            id: 10,
                            startAt: "2026-11-14T16:53:00.000Z",
                            endAt: "2026-11-14T17:23:00.000Z",
                            patient: {
                                id: 5,
                                name: "María Fernanda López",
                                photoUrl,
                                document: "CC 123456",
                                phone: "300 123 4567",
                            },
                            specialty: "Medicina General",
                            doctor: "Dra. Ana Torres",
                            status: "Attended",
                            statusLabel: "Asistida",
                        },
                    }),
                };
            }

            return {
                ok: true,
                json: async () => ({
                    appointments: [
                        {
                            id: 10,
                            startAt: "2026-11-14T16:53:00.000Z",
                            endAt: "2026-11-14T17:23:00.000Z",
                            patient: {
                                id: 5,
                                name: "María Fernanda López",
                                document: "CC 123456",
                                photoUrl,
                            },
                            specialty: "Medicina General",
                            doctor: "Dra. Ana Torres",
                            status: "Attended",
                            statusLabel: "Asistida",
                        },
                        {
                            id: 11,
                            startAt: "2026-11-25T16:00:00.000Z",
                            endAt: "2026-11-25T16:30:00.000Z",
                            patient: {
                                id: 6,
                                name: "Carlos Pérez",
                                document: "CC 654321",
                                photoUrl: null,
                            },
                            specialty: "Medicina General",
                            doctor: "Dra. Ana Torres",
                            status: "Confirmed",
                            statusLabel: "Confirmada",
                        },
                    ],
                    statuses: [
                        { value: "Confirmed", label: "Confirmada" },
                        { value: "Attended", label: "Asistida" },
                    ],
                    specialties: [{ id: 2, name: "Medicina General" }],
                    doctors: [{ id: 3, name: "Dra. Ana Torres" }],
                    stats: {
                        total: 2,
                        Confirmed: 1,
                        "In Progress": 0,
                        Attended: 1,
                        Cancelled: 0,
                        "No Show": 0,
                    },
                    pagination: { page: 1, pageSize: 10, totalItems: 2, totalPages: 1 },
                }),
            };
        };
    }, demoPatientPhoto);
    await page.addScriptTag({ content: scripts });

    const viewButton = page.getByRole("button", {
        name: "Ver detalles de la cita de María Fernanda López",
    });
    await viewButton.waitFor({ state: "visible" });
    assert.equal(
        await page
            .locator(".appointments-table .appointment-date-cell")
            .first()
            .evaluate((cell) => getComputedStyle(cell).display),
        "table-cell",
    );
    assert.equal(
        await page
            .locator(".appointment-patient-cell")
            .first()
            .evaluate((cell) => getComputedStyle(cell).display),
        "flex",
    );
    assert.equal(
        await page
            .locator(".appointments-table .appointment-patient-cell img")
            .first()
            .getAttribute("src")
            .then((src) => src.startsWith("data:image/")),
        true,
    );
    assert.equal(await page.getByRole("link", { name: /Ver detalles/ }).count(), 0);
    assert.equal(await page.locator(".appointments-table .appointment-edit-link svg").count(), 1);

    const screenshotDirectory = process.env.APPOINTMENT_SCREENSHOT_DIR;
    if (screenshotDirectory) {
        await mkdir(screenshotDirectory, { recursive: true });
        await page.screenshot({
            path: path.join(screenshotDirectory, "admin-appointments-desktop.png"),
            fullPage: true,
        });
    }

    await viewButton.click();
    const dialog = page.getByRole("dialog", { name: "Detalle de la cita" });
    await dialog.waitFor({ state: "visible" });
    await dialog.getByText("#10", { exact: true }).waitFor();
    await dialog.getByText("CC 123456 · 300 123 4567").waitFor();
    await dialog.getByText("Medicina General").waitFor();
    await dialog.getByText("Dra. Ana Torres").waitFor();
    await dialog.getByText("Asistida", { exact: true }).waitFor();
    assert.equal(await dialog.locator("img").count(), 1);
    const accessibility = await new AxeBuilder({ page })
        .include("[data-appointment-details-dialog]")
        .analyze();
    assert.deepEqual(
        accessibility.violations.map((violation) => violation.id),
        [],
        JSON.stringify(
            accessibility.violations.map((violation) => ({
                id: violation.id,
                targets: violation.nodes.map((node) => ({
                    target: node.target,
                    summary: node.failureSummary,
                })),
            })),
        ),
    );

    if (screenshotDirectory) {
        await page.screenshot({
            path: path.join(screenshotDirectory, "admin-appointment-details-desktop.png"),
            fullPage: false,
        });
    }

    for (const viewport of [
        { width: 390, height: 844 },
        { width: 320, height: 740 },
        { width: 768, height: 1024 },
        { width: 1440, height: 960 },
    ]) {
        await page.setViewportSize(viewport);
        assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false,
            `Details modal overflows at ${viewport.width}px.`,
        );
        assert.equal(
            await dialog.evaluate((element) => {
                const bounds = element.getBoundingClientRect();
                return bounds.left >= 0 && bounds.right <= innerWidth;
            }),
            true,
            `Details modal extends beyond the screen at ${viewport.width}px.`,
        );
        if (screenshotDirectory && viewport.width === 390) {
            await page.screenshot({
                path: path.join(screenshotDirectory, "admin-appointment-details-mobile.png"),
                fullPage: false,
            });
        }
    }

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await viewButton.click();
    await dialog.getByRole("button", { name: "Cerrar detalles de la cita" }).click();
    await dialog.waitFor({ state: "hidden" });
    console.log(
        "PASS: appointment details open in a modal with patient photo, contact, appointment data, and responsive layout.",
    );
    await context.close();
} finally {
    await browser.close();
}
