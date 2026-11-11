import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import pug from "pug";
import { chromium } from "playwright";

const appStyles = await readFile(path.resolve("public/css/app.css"), "utf8");
const dashboardStyles = await readFile(path.resolve("public/css/patient-dashboard.css"), "utf8");
const rescheduleStyles = await readFile(path.resolve("public/css/patient-reschedule.css"), "utf8");
const rescheduleScript = await readFile(path.resolve("public/js/patient-reschedule.js"), "utf8");
const sidebarScript = await readFile(path.resolve("public/js/patient-sidebar.js"), "utf8");
const patientPhoto = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="40" fill="#dff2ff"/><circle cx="40" cy="30" r="15" fill="#168de2"/><path d="M13 76c2-18 13-28 27-28s25 10 27 28" fill="#13b8b0"/></svg>',
)}`;

const html = pug.renderFile(path.resolve("views/patient/reschedule-appointment.pug"), {
    pageTitle: "Reprogramar cita | SaludVital",
    activeNav: "reschedule",
    patientName: "Paciente Ejemplo",
    patientPhotoUrl: patientPhoto,
    notificationCount: 1,
    appointments: [
        {
            id: 123,
            doctor_id: 42,
            doctor_label: "Dr. Carlos Ejemplo",
            specialty: { name: "Medicina general" },
            start_at: "2027-01-15T15:00:00.000Z",
            history: [],
        },
    ],
    selectedAppointmentId: null,
});

const browser = await chromium.launch({ headless: true, channel: "chrome" });

async function createPage(viewport) {
    const page = await browser.newPage({ viewport });
    await page.route("http://saludvital.test/**", async (route) => {
        const assetPath = path.resolve("public", `.${new URL(route.request().url()).pathname}`);
        const publicPath = path.resolve("public");

        if (!assetPath.startsWith(`${publicPath}${path.sep}`)) {
            await route.fulfill({ status: 404 });
            return;
        }

        try {
            const body = await readFile(assetPath);
            const contentType = assetPath.endsWith(".png")
                ? "image/png"
                : "application/octet-stream";
            await route.fulfill({ status: 200, contentType, body });
        } catch {
            await route.fulfill({ status: 404 });
        }
    });
    await page.setContent(html.replace("</head>", '<base href="http://saludvital.test/"></head>'));
    await page.addStyleTag({ content: appStyles });
    await page.addStyleTag({ content: dashboardStyles });
    await page.addStyleTag({ content: rescheduleStyles });
    await page.addStyleTag({
        content: `@media (max-width: 760px) { .sv-sidebar { display: none !important; } .sv-sidebar-backdrop { display: none !important; } }`,
    });
    await page.addScriptTag({ content: sidebarScript });
    await page.addScriptTag({ content: rescheduleScript });
    await page.evaluate(() => {
        document.querySelector(".sv-sidebar")?.classList.remove("is-open");
        document.querySelector("[data-close-sidebar]")?.classList.remove("is-visible");
        document.body.classList.remove("sidebar-menu-open");
        window.fetch = async (url, options = {}) => {
            if (String(url).includes("/availability")) {
                return {
                    ok: true,
                    json: async () => ({ success: true, data: ["09:00", "10:30"] }),
                };
            }
            if (String(url).includes("/reschedule")) {
                window.rescheduleRequestMethod = options.method;
                return { ok: true, json: async () => ({ success: true }) };
            }
            return { ok: false, json: async () => ({ success: false }) };
        };
    });
    return page;
}

try {
    const desktopPage = await createPage({ width: 1440, height: 1000 });
    assert.equal(await desktopPage.locator("[data-reschedule-panel]").count(), 3);
    assert.equal(await desktopPage.locator('[data-reschedule-step-button="2"]').isDisabled(), true);

    await desktopPage.locator('input[name="appointmentId"]').check();
    await desktopPage.locator(".reschedule-time-option").first().waitFor();
    await desktopPage.locator(".reschedule-time-option").first().click();
    assert.equal(
        await desktopPage.locator('[data-reschedule-step="3"] button').getAttribute("aria-current"),
        "step",
    );
    assert.equal(
        await desktopPage.locator('[data-reschedule-step-button="3"]').isDisabled(),
        false,
    );
    assert.equal(
        await desktopPage.locator("img[data-patient-photo]").getAttribute("src"),
        patientPhoto,
    );

    await desktopPage.locator('[data-reschedule-step-button="1"]').click();
    assert.equal(
        await desktopPage.locator('[data-reschedule-step-button="1"]').getAttribute("aria-current"),
        "step",
    );
    await desktopPage.locator('[data-reschedule-step-button="3"]').click();
    assert.equal(
        await desktopPage.locator('[data-reschedule-step-button="3"]').getAttribute("aria-current"),
        "step",
    );
    assert.ok(
        (await desktopPage.evaluate(() => document.documentElement.scrollWidth)) <= 1440,
        "Desktop layout should not overflow horizontally",
    );

    if (process.env.PATIENT_RESCHEDULE_SCREENSHOT_DIR) {
        const screenshotDir = path.resolve(process.env.PATIENT_RESCHEDULE_SCREENSHOT_DIR);
        await mkdir(screenshotDir, { recursive: true });
        await desktopPage.screenshot({
            path: path.join(screenshotDir, "patient-reschedule-desktop.png"),
            fullPage: true,
        });
    }

    const mobilePage = await createPage({ width: 390, height: 844 });
    const step1Panel = mobilePage.locator('[data-reschedule-panel="1"]');
    const step2Panel = mobilePage.locator('[data-reschedule-panel="2"]');
    const step3Panel = mobilePage.locator('[data-reschedule-panel="3"]');

    assert.equal(await step1Panel.isVisible(), true);
    assert.equal(await step2Panel.isVisible(), false);
    assert.equal(await step3Panel.isVisible(), false);
    assert.equal(await mobilePage.locator('[data-reschedule-step-button="2"]').isDisabled(), true);

    if (process.env.PATIENT_RESCHEDULE_SCREENSHOT_DIR) {
        await mobilePage.screenshot({
            path: path.join(
                path.resolve(process.env.PATIENT_RESCHEDULE_SCREENSHOT_DIR),
                "patient-reschedule-mobile-step-1.png",
            ),
            fullPage: true,
        });
    }

    await mobilePage.locator('input[name="appointmentId"]').check();
    assert.equal(await step2Panel.isVisible(), true);
    assert.equal(await step3Panel.isVisible(), false);
    assert.equal(
        await mobilePage.locator('[data-reschedule-step-button="2"]').getAttribute("aria-current"),
        "step",
    );
    assert.equal(
        await mobilePage.locator("img[data-patient-photo]").getAttribute("src"),
        patientPhoto,
    );

    await mobilePage.locator(".reschedule-time-option").first().waitFor();
    await mobilePage.locator(".reschedule-time-option").first().click();
    assert.equal(await step3Panel.isVisible(), true);
    assert.equal(await step1Panel.isVisible(), false);
    assert.equal(await step2Panel.isVisible(), false);
    assert.equal(await mobilePage.locator(".reschedule-submit").isEnabled(), true);
    assert.equal(
        await mobilePage.locator('[data-reschedule-step-button="3"]').getAttribute("aria-current"),
        "step",
    );
    assert.ok(
        (await mobilePage.evaluate(() => document.documentElement.scrollWidth)) <= 390,
        "Mobile layout should not overflow horizontally",
    );

    if (process.env.PATIENT_RESCHEDULE_SCREENSHOT_DIR) {
        await mobilePage.screenshot({
            path: path.join(
                path.resolve(process.env.PATIENT_RESCHEDULE_SCREENSHOT_DIR),
                "patient-reschedule-mobile-step-3.png",
            ),
            fullPage: true,
        });
    }

    await mobilePage.locator('[data-reschedule-step-button="1"]').focus();
    await mobilePage.keyboard.press("Enter");
    assert.equal(
        await mobilePage.locator('[data-reschedule-step-button="1"]').getAttribute("aria-current"),
        "step",
    );
    assert.equal(await step1Panel.isVisible(), true);
    assert.equal(await step2Panel.isVisible(), false);
    await mobilePage.locator('[data-reschedule-step-button="3"]').click();
    assert.equal(await step3Panel.isVisible(), true);

    await mobilePage.locator(".reschedule-submit").click();
    await mobilePage.locator("[data-confirm-reschedule]").click();
    await mobilePage.locator("[data-feedback-dialog]").waitFor({ state: "visible" });
    assert.equal(
        await mobilePage.locator('[data-reschedule-step-button="4"]').getAttribute("aria-current"),
        "step",
    );
    assert.equal(await mobilePage.evaluate(() => window.rescheduleRequestMethod), "POST");
    console.log("Patient rescheduling step navigation and mobile progression passed.");
} finally {
    await browser.close();
}
