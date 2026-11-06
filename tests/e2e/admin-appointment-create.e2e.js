import path from "node:path";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
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
const wizardStyles = await readFile(path.resolve("public/css/admin-booking-wizard.css"), "utf8");
const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
});

try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    async function mount() {
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
            return route.fulfill({
                contentType: "text/html",
                body: "<!doctype html><html><body></body></html>",
            });
        });
        await page.goto("http://127.0.0.1:3200");
        await page.setContent(markup, { waitUntil: "domcontentloaded" });
        await page.addStyleTag({ content: dashboardStyles });
        await page.addStyleTag({ content: appointmentStyles });
        await page.addStyleTag({ content: wizardStyles });
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
                        specialties: [
                            { id: 3, name: "Pediatría" },
                            { id: 4, name: "Medicina general" },
                        ],
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
    }
    await mount();
    async function reviewStep(step) {
        for (const viewport of [
            { width: 1440, height: 900 },
            { width: 768, height: 1024 },
            { width: 390, height: 844 },
            { width: 320, height: 740 },
        ]) {
            await page.setViewportSize(viewport);
            assert.equal(
                await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                false,
                `Overflow in step ${step} at ${viewport.width}`,
            );
            const audit = await new AxeBuilder({ page })
                .include("[data-admin-appointment-create]")
                .analyze();
            assert.deepEqual(
                audit.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
                [],
            );
            if (process.env.BOOKING_SCREENSHOT_DIR)
                await page.screenshot({
                    path: path.join(
                        process.env.BOOKING_SCREENSHOT_DIR,
                        `admin-booking-step-${step}-${viewport.width}.png`,
                    ),
                    fullPage: true,
                });
        }
        await page.setViewportSize({ width: 1440, height: 900 });
    }
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

    await reviewStep(1);
    await page.locator("[data-booking-patient]").selectOption("8");
    assert.equal(await page.locator("[data-booking-next]").isDisabled(), true);
    await page.locator("[data-specialty-search]").fill("pediatria");
    assert.equal(await page.locator("[data-specialty-list] button").count(), 1);
    await page.locator("[data-specialty-list] button").click();
    await page.locator("[data-booking-next]").click();
    await reviewStep(2);
    await page.getByRole("button", { name: /Dra. Ana Torres/ }).click();
    await page.locator("[data-booking-next]").click();
    const date = await page
        .locator("[data-calendar-days] button:not(:disabled)")
        .first()
        .getAttribute("data-date");
    await page.locator(`[data-date="${date}"]`).click();
    await page.locator('[data-time="10:00"]').waitFor();
    await reviewStep(3);
    await page.locator('[data-time="10:00"]').click();
    await page.locator("[data-booking-next]").click();
    assert.match(await page.locator("[data-booking-summary]").innerText(), /María López/);
    assert.match(await page.locator("[data-booking-summary]").innerText(), /Pediatría/);
    assert.match(await page.locator("[data-booking-summary]").innerText(), /Ana Torres/);
    assert.equal(
        await page.evaluate(() =>
            window.appointmentRequests.some((r) => r.options.method === "POST"),
        ),
        false,
    );
    await reviewStep(4);
    await page.getByLabel("Motivo de consulta").fill("Control general");
    await page.getByRole("button", { name: "Confirmar cita" }).click();
    await page.getByRole("alert").getByText("Ese horario ya no está disponible.").waitFor();
    if ((await page.locator("[data-booking-patient]").inputValue()) !== "8") {
        throw new Error("Form values were lost after an availability error.");
    }

    await page.locator('[data-time="10:00"]').click();
    await page.locator("[data-booking-next]").click();
    await page.locator("[data-booking-back]").click();
    assert.equal(await page.locator('[data-time="10:00"]').getAttribute("aria-pressed"), "true");
    await page.locator("[data-booking-next]").click();
    await page.getByRole("button", { name: "Confirmar cita" }).click();
    await page
        .getByRole("dialog")
        .getByText(/Número de cita: 91/)
        .waitFor();
    const submittedBody = JSON.parse(
        await page.evaluate(() => window.appointmentRequests.at(-1).options.body),
    );
    if (
        submittedBody.patientId !== "8" ||
        submittedBody.specialtyId !== 3 ||
        submittedBody.doctorId !== 6 ||
        submittedBody.reason !== "Control general"
    ) {
        throw new Error(
            `Unexpected appointment creation payload: ${JSON.stringify(submittedBody)}`,
        );
    }
    assert.equal(await page.locator("[data-create-submit]").isDisabled(), true);
    console.log(
        "PASS: guided selection, confirmation, conflict recovery, preserved fields, and duplicate-submit guard.",
    );
    await page.getByRole("dialog").evaluate((dialog) => dialog.close());
    for (const viewport of [
        { width: 1440, height: 900 },
        { width: 390, height: 844 },
        { width: 320, height: 740 },
    ]) {
        await page.setViewportSize(viewport);
        assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false,
        );
        const audit = await new AxeBuilder({ page })
            .include("[data-admin-appointment-create]")
            .analyze();
        assert.deepEqual(
            audit.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
            [],
        );
        if (process.env.BOOKING_SCREENSHOT_DIR)
            await page.screenshot({
                path: path.join(
                    process.env.BOOKING_SCREENSHOT_DIR,
                    `admin-booking-confirmation-${viewport.width}.png`,
                ),
                fullPage: true,
            });
    }
    // A slow previous specialty response must never replace the current selection.
    await mount();
    await page.locator('[data-booking-patient] option[value="8"]').waitFor({ state: "attached" });
    await page.evaluate(() => {
        const original = window.fetch;
        window.fetch = async (request, options) => {
            const url = new URL(request, location.origin);
            if (url.pathname.endsWith("/doctors") && url.searchParams.get("specialtyId") === "3") {
                return new Promise((resolve) => {
                    window.releaseDoctors = () =>
                        resolve({
                            ok: true,
                            json: async () => ({
                                doctors: [{ id: 6, name: "Respuesta anterior" }],
                            }),
                        });
                });
            }
            if (url.pathname.endsWith("/doctors"))
                return {
                    ok: true,
                    json: async () => ({ doctors: [{ id: 7, name: "Dr. Selección actual" }] }),
                };
            return original(request, options);
        };
    });
    await page.locator("[data-booking-patient]").selectOption("8");
    await page.getByRole("button", { name: /Pediatría/ }).click();
    await page.getByRole("button", { name: /Medicina general/ }).click();
    await page.locator("[data-booking-next]").click();
    await page.getByRole("button", { name: /Dr. Selección actual/ }).waitFor();
    await page.evaluate(() => window.releaseDoctors());
    assert.equal(await page.getByRole("button", { name: /Respuesta anterior/ }).count(), 0);
    await page.getByRole("button", { name: /Dr. Selección actual/ }).click();
    await page.locator("[data-booking-next]").click();
    await page.evaluate(() => {
        const original = window.fetch;
        window.fetch = async (request, options) => {
            const url = new URL(request, location.origin);
            if (url.pathname.endsWith("/availability")) {
                if (!window.releaseTimes)
                    return new Promise((resolve) => {
                        window.releaseTimes = () =>
                            resolve({ ok: true, json: async () => ({ times: ["09:00"] }) });
                    });
                return { ok: true, json: async () => ({ times: ["11:00"] }) };
            }
            return original(request, options);
        };
    });
    const days = page.locator("[data-calendar-days] button:not(:disabled)");
    await days.nth(0).click();
    // Move forward if today is the final day of its month.
    if ((await days.count()) < 2) await page.getByRole("button", { name: "Mes siguiente" }).click();
    await page.locator("[data-calendar-days] button:not(:disabled)").nth(1).click();
    await page.locator('[data-time="11:00"]').waitFor();
    await page.evaluate(() => window.releaseTimes());
    assert.equal(await page.locator('[data-time="09:00"]').count(), 0);
    await page.locator('[data-time="11:00"]').click();
    await page.locator("[data-booking-back]").click();
    await page.locator("[data-booking-back]").click();
    await page.getByRole("button", { name: /Pediatría/ }).click();
    await page.locator("[data-booking-next]").click();
    assert.equal(await page.locator("[data-booking-next]").isDisabled(), true);
    console.log(
        "PASS: stale doctor/time responses are ignored and upstream changes clear dependent selections.",
    );
    await context.close();
} finally {
    await browser.close();
}
