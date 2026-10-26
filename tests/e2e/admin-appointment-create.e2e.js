import path from "node:path";
import pug from "pug";
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";

const markup = pug.renderFile(path.resolve("views/admin/appointment-create.pug"), {
    pageTitle: "Nueva cita | SaludVital",
    adminName: "Administradora",
});
const script = await readFile(path.resolve("public/js/admin-appointment-create.js"), "utf8");
const dashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const appointmentStyles = await readFile(path.resolve("public/css/admin-appointments.css"), "utf8");
const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route("http://127.0.0.1:3200/**", (route) =>
        route.fulfill({
            contentType: "text/html",
            body: "<!doctype html><html><body></body></html>",
        }),
    );
    await page.goto("http://127.0.0.1:3200");
    await page.setContent(markup, { waitUntil: "domcontentloaded" });
    await page.addStyleTag({ content: dashboardStyles });
    await page.addStyleTag({ content: appointmentStyles });
    await page.evaluate(() => {
        window.appointmentRequests = [];
        window.appointmentConflictNext = true;
        window.fetch = async (request, options = {}) => {
            const url = new URL(request, window.location.origin);
            window.appointmentRequests.push({ url: url.pathname + url.search, options });
            let result;
            if (url.pathname.endsWith("/options")) {
                result = {
                    patients: [{ id: 8, name: "María López", document: "CC 123456" }],
                    specialties: [{ id: 3, name: "Pediatría" }],
                };
            } else if (url.pathname.endsWith("/doctors")) {
                result = { doctors: [{ id: 6, name: "Dra. Ana Torres" }] };
            } else if (url.pathname.endsWith("/availability")) {
                result = { times: ["10:00"] };
            } else if (options.method === "POST" && window.appointmentConflictNext) {
                window.appointmentConflictNext = false;
                return {
                    ok: false,
                    status: 409,
                    json: async () => ({ message: "Ese horario ya no está disponible." }),
                };
            } else {
                result = {
                    appointmentId: 91,
                    message: "La cita se creó y confirmó correctamente.",
                };
            }
            return { ok: true, status: 200, json: async () => result };
        };
    });
    await page.addScriptTag({ content: script });
    await page.locator('[data-booking-patient] option[value="8"]').waitFor({ state: "attached" });
    if (/pendiente/i.test(await page.locator("main").innerText())) {
        throw new Error(
            "The appointment creation interface must not display the unsupported status.",
        );
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
        if (hasOverflow) throw new Error(`Appointment creation overflows at ${viewport.label}.`);
        console.log(
            `PASS: appointment creation has no horizontal overflow at ${viewport.label} (${viewport.width}x${viewport.height}).`,
        );
    }

    await page.locator("[data-booking-patient]").selectOption("8");
    await page.locator("[data-booking-specialty]").selectOption("3");
    await page.locator("[data-booking-doctor]").selectOption("6");
    const date = await page.locator("[data-booking-date]").getAttribute("min");
    await page.locator("[data-booking-date]").fill(date);
    await page.locator("[data-booking-time]").selectOption("10:00");
    await page.getByLabel("Motivo de consulta").fill("Control general");
    await page.getByRole("button", { name: "Crear cita" }).click();
    await page.getByRole("alert").getByText("Ese horario ya no está disponible.").waitFor();
    if ((await page.locator("[data-booking-patient]").inputValue()) !== "8") {
        throw new Error("Form values were lost after an availability error.");
    }

    await page.getByRole("button", { name: "Crear cita" }).click();
    await page
        .getByRole("dialog")
        .getByText(/Número de cita: 91/)
        .waitFor();
    const submittedBody = JSON.parse(
        await page.evaluate(() => window.appointmentRequests.at(-1).options.body),
    );
    if (
        submittedBody.patientId !== "8" ||
        submittedBody.specialtyId !== "3" ||
        submittedBody.doctorId !== "6" ||
        submittedBody.reason !== "Control general"
    ) {
        throw new Error(
            `Unexpected appointment creation payload: ${JSON.stringify(submittedBody)}`,
        );
    }
    console.log(
        "PASS: compatibility lookup, availability errors, preserved fields, and confirmation.",
    );
} finally {
    await browser.close();
}
