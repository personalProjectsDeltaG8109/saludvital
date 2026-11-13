import path from "node:path";
import { chromium } from "playwright";
import pug from "pug";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const root = process.cwd();
(async () => {
    const b = await chromium.launch({
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
        headless: true,
    });
    try {
        const p = await b.newPage();
        await p.route("http://127.0.0.1:3112/**", async (route) => {
            const pathname = new URL(route.request().url()).pathname;
            if (
                pathname.startsWith("/css/") ||
                pathname.startsWith("/brand/") ||
                pathname.startsWith("/js/")
            ) {
                try {
                    return route.fulfill({
                        body: await fs.readFile(root + "/public" + pathname),
                        contentType: pathname.endsWith(".css")
                            ? "text/css"
                            : pathname.endsWith(".js")
                              ? "application/javascript"
                              : pathname.endsWith(".svg")
                                ? "image/svg+xml"
                                : "image/png",
                    });
                } catch {}
            }
            return route.fulfill({
                body: "<!doctype html><html><body></body></html>",
                contentType: "text/html",
            });
        });
        for (const eligible of [true, false]) {
            await p.goto("http://127.0.0.1:3112/");
            await p.setContent(
                pug.renderFile(root + "/views/patient/dashboard.pug", {
                    pageTitle: "Paciente",
                    patientName: "Paciente de prueba",
                    activeNav: "home",
                    nextAppointment: {
                        id: 18,
                        start_at: new Date(Date.now() + 48 * 3600000),
                        doctor: { profile_photo_url: "/brand/logo-symbol.png" },
                        doctor_label: "Dr. Carlos Ramírez",
                        specialty: { name: "General Medicine" },
                        status: { name: "Confirmed" },
                        history: [],
                        can_reschedule: eligible,
                        can_cancel: eligible,
                    },
                    upcomingAppointments: [],
                    notificationChannelStates: {},
                    notificationCount: 0,
                }),
            );
            await p.locator(".sv-appointment-doctor-photo-trigger").first().waitFor();
            await p.addScriptTag({ path: root + "/public/js/patient-appointments.js" });
            for (const { width, height } of [
                { width: 1440, height: 900 },
                { width: 768, height: 900 },
                { width: 390, height: 900 },
                { width: 375, height: 667 },
                { width: 320, height: 640 },
            ]) {
                await p.setViewportSize({ width, height });
                await p.waitForTimeout(100);
                assert.equal(
                    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                    false,
                );
                const hero = await p.locator(".sv-hero").boundingBox();
                for (const selector of [".sv-hero-copy h2", ".sv-hero-copy p"]) {
                    const textBounds = await p.locator(selector).boundingBox();
                    assert.ok(
                        textBounds.y >= hero.y,
                        `${selector} starts above the welcome banner`,
                    );
                    assert.ok(
                        textBounds.y + textBounds.height <= hero.y + hero.height,
                        `${selector} is clipped by the welcome banner at ${width}x${height}`,
                    );
                }
                const card = p.locator(".sv-appointment");
                assert.equal(
                    await card.locator(".sv-appointment-buttons a").count(),
                    eligible ? 1 : 0,
                );
                assert.equal(
                    await card
                        .locator(".sv-appointment-buttons .appointment-cancel-button")
                        .count(),
                    eligible ? 1 : 0,
                );
                assert.equal(
                    await card
                        .locator(".sv-appointment-buttons .appointment-detail-toggle")
                        .evaluate((button) => getComputedStyle(button).backgroundColor),
                    "rgb(7, 155, 105)",
                );
                assert.equal(
                    await card.getByRole("link", { name: "Ver todas" }).getAttribute("href"),
                    "/patient/appointments",
                );
                const bounds = await card.boundingBox(),
                    actions = await card.locator(".sv-appointment-buttons").boundingBox();
                assert.ok(
                    actions.y + actions.height <= bounds.y + bounds.height,
                    "Actions clipped",
                );
                const img = await card
                        .locator(".sv-appointment-doctor-photo-trigger")
                        .boundingBox(),
                    name = await card.locator(".sv-appointment-doctor-name").boundingBox();
                const specialty = await card.locator(".sv-appointment-specialty").boundingBox();
                assert.ok(specialty.y >= name.y + name.height);
                assert.ok(Math.abs(img.y + img.height / 2 - name.y - name.height / 2) < 2);
                if (eligible && process.env.PATIENT_CARD_SCREENSHOT_DIR)
                    await card.screenshot({
                        path: path.join(
                            process.env.PATIENT_CARD_SCREENSHOT_DIR,
                            `patient-next-appointment-${width}.png`,
                        ),
                    });
            }
            await p.locator(".sv-appointment-buttons .appointment-detail-toggle").click();
            await p.locator("#appointment-details-18").waitFor({ state: "visible" });
            assert.equal(
                await p.locator("#appointment-details-18").getByText("Centro de atención").count(),
                0,
            );
            console.log(
                "PASS card layout, actions, details, and no overflow; reschedulable=" + eligible,
            );
        }
    } finally {
        await b.close();
    }
})().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
