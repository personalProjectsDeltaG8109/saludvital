import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import pug from "pug";
import { chromium } from "playwright";

const appStyles = await readFile(path.resolve("public/css/app.css"), "utf8");
const dashboardStyles = await readFile(path.resolve("public/css/patient-dashboard.css"), "utf8");
const profileStyles = await readFile(path.resolve("public/css/patient-profile.css"), "utf8");
const sidebarScript = await readFile(path.resolve("public/js/patient-sidebar.js"), "utf8");
const html = pug.renderFile(path.resolve("views/patient/profile.pug"), {
    pageTitle: "Mi perfil | SaludVital",
    activeNav: "profile",
    patientName: "Juan Esteban Montoya Marín",
    patientPhotoUrl: null,
    notificationCount: 2,
    patient: {
        first_name: "Juan Esteban",
        last_name: "Montoya Marín",
        profile_photo_url: null,
        user: { email: "juan@example.com", pending_email: null },
        phone: "3001234567",
        document_type: "CC",
        document_number: "1002576545",
        municipality: "Chinchiná",
        department: "Caldas",
        date_of_birth: "2002-05-02",
        address: "Calle 10 # 5-20",
        blood_type: "O+",
        allergies: "Ninguna",
        existing_conditions: "Ninguna",
    },
    appointmentCount: 5,
    specialtyCount: 1,
    yearsAsPatient: 0,
    emergencyContact: null,
    departments: [{ code: "CAL", name: "Caldas" }],
    currentDepartmentCode: "CAL",
    municipalities: [{ code: "CHI", name: "Chinchiná" }],
});

const browser = await chromium.launch({ headless: true, channel: "chrome" });

try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
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
    await page.addStyleTag({ content: profileStyles });
    await page.addScriptTag({ content: sidebarScript });

    for (const width of [320, 375, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        const pageLayout = await page.evaluate(() => ({
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
            layoutColumns: getComputedStyle(document.querySelector(".profile-layout"))
                .gridTemplateColumns,
            summaryDisplay: getComputedStyle(
                document.querySelector('[data-section="personal"] summary'),
            ).display,
            accountActionsVisible: Boolean(document.querySelector(".profile-quick-actions")),
        }));

        assert.ok(
            pageLayout.documentWidth <= pageLayout.viewportWidth,
            `Horizontal overflow at ${width}px: ${pageLayout.documentWidth}px`,
        );
        assert.ok(pageLayout.accountActionsVisible, `Account actions missing at ${width}px`);

        if (width <= 760) {
            assert.notEqual(pageLayout.summaryDisplay, "none");
        } else {
            assert.equal(pageLayout.summaryDisplay, "none");
        }
    }

    assert.equal(await page.locator(".profile-hero h2").textContent(), "Mi perfil");
    const desktopHeroHeight = await page
        .locator(".profile-hero")
        .evaluate((element) => Math.round(element.getBoundingClientRect().height));
    assert.ok(desktopHeroHeight <= 100, `Profile heading is too tall: ${desktopHeroHeight}px`);
    assert.equal(await page.getByRole("heading", { name: "Información personal" }).count(), 1);
    assert.equal(await page.getByRole("heading", { name: "Información médica" }).count(), 1);
    assert.equal(await page.getByRole("heading", { name: "Contacto de emergencia" }).count(), 1);
    assert.equal(
        (await page.locator(".profile-identity-copy h2").textContent()).trim(),
        "Juan Esteban Montoya Marín",
    );

    if (process.env.PATIENT_PROFILE_SCREENSHOT_DIR) {
        const screenshotDir = path.resolve(process.env.PATIENT_PROFILE_SCREENSHOT_DIR);
        await mkdir(screenshotDir, { recursive: true });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.screenshot({
            path: path.join(screenshotDir, "patient-profile-desktop.png"),
            fullPage: true,
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => {
            document.querySelector("#patient-sidebar").style.display = "none";
            document.querySelector(".sv-sidebar-backdrop").style.display = "none";
            document.querySelector(".sv-bottom-nav")?.style.setProperty("position", "static");
        });
        await page.screenshot({
            path: path.join(screenshotDir, "patient-profile-mobile.png"),
            fullPage: true,
        });
    }

    console.log("Patient profile responsive layout passed at 320, 375, 768, 1024 and 1440px.");
} finally {
    await browser.close();
}
