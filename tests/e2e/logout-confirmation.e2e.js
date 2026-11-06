import path from "node:path";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import pug from "pug";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const root = process.cwd();
const views = path.join(root, "views");
const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
});
const outputs = process.env.LOGOUT_SCREENSHOT_DIR;
const layouts = {
    patient: pug.renderFile(path.join(views, "patient/dashboard.pug"), {
        patientName: "Paciente de prueba",
        nextAppointment: null,
        upcomingAppointments: [],
        notificationChannelStates: {},
        notificationCount: 0,
    }),
    doctor: pug.render(
        `doctype html
html(lang="es")
    head
        meta(charset="UTF-8")
        title Panel médico
        meta(name="viewport", content="width=device-width, initial-scale=1")
        link(rel="stylesheet", href="/css/patient-dashboard.css")
    body.sv-dashboard
        include /doctor/partials/sidebar.pug
        main
            h1 Panel médico`,
        { basedir: views },
    ),
    admin: pug.render(
        `doctype html
html(lang="es")
    head
        meta(charset="UTF-8")
        title Panel administrativo
        meta(name="viewport", content="width=device-width, initial-scale=1")
        link(rel="stylesheet", href="/css/admin-dashboard.css")
    body.admin-app
        include /admin/partials/admin-shell.pug
        +adminSidebar("dashboard")
        .admin-main-shell
            +adminTopbar
            main
                h1 Panel administrativo`,
        { basedir: views },
    ),
};
try {
    for (const [role, markup] of Object.entries(layouts)) {
        const context = await browser.newContext();
        const page = await context.newPage();
        const posts = [];
        const runtimeErrors = [];
        page.on("pageerror", (error) => runtimeErrors.push(error.message));
        await page.route("http://127.0.0.1:3113/**", async (route) => {
            const url = new URL(route.request().url());
            if (url.pathname === "/logout") {
                posts.push({ method: route.request().method(), body: route.request().postData() });
                return route.fulfill({
                    contentType: "text/html",
                    body: "<!doctype html><html><body>Sesión cerrada</body></html>",
                });
            }
            if (url.pathname === "/fixture")
                return route.fulfill({ contentType: "text/html", body: markup });
            if (/^\/(css|js|brand)\//.test(url.pathname)) {
                try {
                    return route.fulfill({
                        body: await fs.readFile(path.join(root, "public", url.pathname.slice(1))),
                        contentType: url.pathname.endsWith(".css")
                            ? "text/css"
                            : url.pathname.endsWith(".js")
                              ? "application/javascript; charset=utf-8"
                              : url.pathname.endsWith(".svg")
                                ? "image/svg+xml"
                                : "image/png",
                    });
                } catch {
                    return route.fulfill({ status: 404, body: "" });
                }
            }
            return route.fulfill({ contentType: "application/json", body: "{}" });
        });
        for (const viewport of [
            { width: 1440, height: 900 },
            { width: 768, height: 1024 },
            { width: 390, height: 844 },
            { width: 320, height: 740 },
            { width: 844, height: 390 },
        ]) {
            await page.setViewportSize(viewport);
            await page.goto("http://127.0.0.1:3113/fixture");
            await page.locator("[data-logout-confirmation]").waitFor({ state: "attached" });
            const forms = page.locator('form[action="/logout"]');
            assert.ok((await forms.count()) > 0);
            for (let index = 0; index < (await forms.count()); index++) {
                const form = forms.nth(index);
                // Exercise every real role form, including the patient mobile button.
                await form.evaluate((form) =>
                    form.requestSubmit(form.querySelector('button[type="submit"]')),
                );
                const dialog = page.locator("[data-logout-confirmation]");
                await dialog.waitFor({ state: "visible" });
                assert.equal(await dialog.locator("h2").textContent(), "¿Deseas cerrar sesión?");
                assert.equal(await page.locator("[data-logout-confirmation]").count(), 1);
                const rect = await dialog.boundingBox();
                assert.ok(
                    Math.abs(rect.x + rect.width / 2 - viewport.width / 2) < 2,
                    "Horizontal centering",
                );
                assert.ok(
                    Math.abs(rect.y + rect.height / 2 - viewport.height / 2) < 2,
                    "Vertical centering",
                );
                assert.ok(
                    rect.x >= 0 &&
                        rect.y >= 0 &&
                        rect.x + rect.width <= viewport.width &&
                        rect.y + rect.height <= viewport.height,
                );
                assert.equal(
                    await page
                        .locator("[data-cancel-logout]")
                        .evaluate((el) => el === document.activeElement),
                    true,
                );
                await page.keyboard.press("Shift+Tab");
                assert.equal(
                    await page
                        .locator("[data-confirm-logout]")
                        .evaluate((el) => el === document.activeElement),
                    true,
                );
                await page.keyboard.press("Tab");
                assert.equal(
                    await page
                        .locator("[data-cancel-logout]")
                        .evaluate((el) => el === document.activeElement),
                    true,
                );
                const audit = await new AxeBuilder({ page })
                    .include("[data-logout-confirmation]")
                    .analyze();
                assert.deepEqual(
                    audit.violations.map((v) => v.id),
                    [],
                );
                if (outputs && index === 0 && [1440, 390].includes(viewport.width))
                    await page.screenshot({
                        path: path.join(outputs, `logout-${role}-${viewport.width}.png`),
                    });
                await page.getByRole("button", { name: "Cancelar", exact: true }).click();
                await dialog.waitFor({ state: "hidden" });
                assert.equal(posts.length, 0);
                await form.evaluate((form) =>
                    form.requestSubmit(form.querySelector('button[type="submit"]')),
                );
                await page.keyboard.press("Escape");
                await dialog.waitFor({ state: "hidden" });
                assert.equal(posts.length, 0);
            }
        }
        const form = page.locator('form[action="/logout"]').first();
        await form.evaluate((form) => {
            const token = document.createElement("input");
            token.type = "hidden";
            token.name = "confirmation_test";
            token.value = "preserved";
            form.append(token);
            form.requestSubmit(form.querySelector('button[type="submit"]'));
        });
        await page.locator("[data-logout-confirmation]").waitFor({ state: "visible" });
        await page.locator("[data-logout-confirmation]").evaluate((dialog) => {
            dialog.close();
            const form = document.querySelector('form[action="/logout"]');
            form.requestSubmit(form.querySelector('button[type="submit"]'));
        });
        await page.locator("[data-logout-confirmation]").waitFor({ state: "visible" });
        await Promise.all([
            page.waitForURL("**/logout", { waitUntil: "domcontentloaded" }),
            page.locator("[data-confirm-logout]").evaluate((button) => {
                button.click();
                button.click();
            }),
        ]);
        assert.equal(posts.length, 1);
        assert.equal(posts[0].method, "POST");
        assert.ok(posts[0].body.includes("confirmation_test=preserved"));
        assert.deepEqual(runtimeErrors, []);
        await context.close();
        console.log(
            `PASS ${role}: centered responsive dialog, cancel, Escape, keyboard containment, accessibility, and one confirmed POST.`,
        );
    }
} finally {
    await browser.close();
}
