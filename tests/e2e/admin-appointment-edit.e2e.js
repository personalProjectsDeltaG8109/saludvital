import path from "node:path";
import pug from "pug";
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";

const markup = pug.renderFile(path.resolve("views/admin/appointment-edit.pug"), {
    pageTitle: "Editar cita #17 | SaludVital",
    adminName: "Administradora",
    appointment: {
        id: 17,
        startAt: "2026-11-04T15:30:00.000Z",
        endAt: "2026-11-04T16:00:00.000Z",
        currentDate: "2026-11-04",
        currentDateLabel: "miércoles, 4 de noviembre de 2026",
        currentTime: "10:30",
        patient: { id: 8, name: "María López" },
        doctor: { id: 6, name: "Dra. Ana Torres" },
        specialty: { id: 3, name: "Pediatría" },
        status: "Confirmed",
        statusLabel: "Confirmada",
        reason: "Seguimiento",
        canEdit: true,
        unavailableMessage: "",
        reschedulesRemaining: 2,
    },
});
const script = await readFile(path.resolve("public/js/admin-appointment-edit.js"), "utf8");
const dashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const appointmentStyles = await readFile(path.resolve("public/css/admin-appointments.css"), "utf8");
const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route("http://127.0.0.1:3201/**", (route) =>
        route.fulfill({
            contentType: "text/html",
            body: "<!doctype html><html><body></body></html>",
        }),
    );
    await page.goto("http://127.0.0.1:3201");
    await page.setContent(markup, { waitUntil: "domcontentloaded" });
    await page.addStyleTag({ content: dashboardStyles });
    await page.addStyleTag({ content: appointmentStyles });
    await page.evaluate(() => {
        window.appointmentEditRequests = [];
        window.appointmentEditConflictNext = true;
        window.fetch = async (request, options = {}) => {
            const url = new URL(request, window.location.origin);
            window.appointmentEditRequests.push({ url: url.pathname + url.search, options });
            let result;
            if (url.pathname.endsWith("/specialties")) {
                result = {
                    specialties: [
                        { id: 3, name: "Pediatría" },
                        { id: 5, name: "Medicina General" },
                    ],
                };
            } else if (url.pathname.endsWith("/doctors")) {
                result = {
                    doctors:
                        url.searchParams.get("specialtyId") === "5"
                            ? [{ id: 7, name: "Dr. Luis Morales" }]
                            : [{ id: 6, name: "Dra. Ana Torres" }],
                };
            } else if (url.pathname.endsWith("/availability")) {
                result = { times: ["11:00"] };
            } else if (options.method === "PATCH" && window.appointmentEditConflictNext) {
                window.appointmentEditConflictNext = false;
                return {
                    ok: false,
                    status: 409,
                    json: async () => ({ message: "Ese horario ya no está disponible." }),
                };
            } else {
                result = {
                    appointmentId: 17,
                    message: "La cita se actualizó y reprogramó correctamente.",
                };
            }
            return { ok: true, status: 200, json: async () => result };
        };
    });
    await page.addScriptTag({ content: script });
    await page.getByRole("heading", { name: "Editar y reprogramar cita" }).waitFor();
    await page.locator('[data-edit-specialty] option[value="3"]').waitFor({ state: "attached" });
    if (/pendiente/i.test(await page.locator("main").innerText())) {
        throw new Error("The appointment editor must not display the unsupported status.");
    }

    for (const viewport of [
        { label: "mobile", width: 375, height: 812 },
        { label: "tablet", width: 768, height: 1024 },
        { label: "desktop", width: 1440, height: 900 },
    ]) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const hasOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
        );
        if (hasOverflow) throw new Error(`Appointment editing overflows at ${viewport.label}.`);
        console.log(
            `PASS: appointment editing has no horizontal overflow at ${viewport.label} (${viewport.width}x${viewport.height}).`,
        );
    }

    await page.locator("[data-edit-specialty]").selectOption("5");
    await page.locator('[data-edit-doctor] option[value="7"]').waitFor({ state: "attached" });
    await page.locator("[data-edit-doctor]").selectOption("7");
    await page.locator("[data-edit-date]").fill("2026-11-05");
    await page.locator("[data-edit-time]").selectOption("11:00");
    await page.locator("[data-edit-reason]").fill("Control de seguimiento");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await page.getByRole("alert").getByText("Ese horario ya no está disponible.").waitFor();
    if (
        (await page.locator("[data-edit-specialty]").inputValue()) !== "5" ||
        (await page.locator("[data-edit-doctor]").inputValue()) !== "7" ||
        (await page.locator("[data-edit-reason]").inputValue()) !== "Control de seguimiento"
    ) {
        throw new Error("Edit values were lost after an availability error.");
    }

    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await page
        .getByRole("dialog")
        .getByText(/Número de cita: 17/)
        .waitFor();
    const submittedBody = JSON.parse(
        await page.evaluate(() => window.appointmentEditRequests.at(-1).options.body),
    );
    if (
        submittedBody.specialtyId !== "5" ||
        submittedBody.doctorId !== "7" ||
        submittedBody.date !== "2026-11-05" ||
        submittedBody.reason !== "Control de seguimiento"
    ) {
        throw new Error(`Unexpected appointment edit payload: ${JSON.stringify(submittedBody)}`);
    }
    console.log(
        "PASS: prefilled values, specialty/doctor selection, conflict handling, and success.",
    );
} finally {
    await browser.close();
}
