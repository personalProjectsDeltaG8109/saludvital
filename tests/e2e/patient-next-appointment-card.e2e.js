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
                        doctor_label: "Dra. Ana Torres",
                        specialty: { name: "Medicina general" },
                        status: { name: "Confirmed" },
                        history: [],
                        can_reschedule: eligible,
                    },
                    upcomingAppointments: [],
                    notificationChannelStates: {},
                    notificationCount: 0,
                }),
            );
            await p.locator(".sv-appointment-doctor-photo-trigger").first().waitFor();
            await p.addScriptTag({ path: root + "/public/js/patient-appointments.js" });
            for (const width of [1440, 768, 390, 320]) {
                await p.setViewportSize({ width, height: 900 });
                await p.waitForTimeout(100);
                assert.equal(
                    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                    false,
                );
                const card = p.locator(".sv-appointment");
                assert.equal(
                    await card.locator(".sv-appointment-buttons a").count(),
                    eligible ? 1 : 0,
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
                assert.ok(name.y >= img.y + img.height);
                assert.ok(Math.abs(img.x + img.width / 2 - name.x - name.width / 2) < 2);
                if (eligible && process.env.PATIENT_CARD_SCREENSHOT_DIR)
                    await card.screenshot({
                        path: path.join(
                            process.env.PATIENT_CARD_SCREENSHOT_DIR,
                            `patient-next-appointment-${width}.png`,
                        ),
                    });
            }
            await p.locator(".sv-appointment-buttons button").click();
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
