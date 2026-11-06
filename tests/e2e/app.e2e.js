import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = "http://127.0.0.1:3100";

// Start the application on an isolated port for end-to-end testing.
const server = spawn(process.execPath, ["server.js"], {
    env: {
        ...process.env,
        NODE_ENV: "test",
        DB_NAME: "saludvital_test",
        JWT_SECRET: "local-test-secret-not-for-production",
        LOGIN_WHATSAPP_CONTACT_NUMBER: "573000000000",
        PORT: "3100",
    },
    stdio: "inherit",
});

let browser;

try {
    // Wait for the login page to become available before starting Playwright.
    let ready = false;
    let lastError = "No response received from the server.";

    for (let attempt = 0; attempt < 30; attempt += 1) {
        if (server.exitCode !== null) {
            throw new Error(
                `The SaludVital server stopped unexpectedly with exit code ${server.exitCode}.`,
            );
        }

        try {
            const response = await fetch(`${baseUrl}/login`, {
                signal: AbortSignal.timeout(3000),
            });

            if (response.ok) {
                ready = true;
                break;
            }

            lastError = `HTTP ${response.status} ${response.statusText}`;
        } catch (error) {
            lastError = error.message;
        }

        await delay(1000);
    }

    if (!ready) {
        throw new Error(`The SaludVital server did not become ready. Last error: ${lastError}`);
    }

    browser = await chromium.launch({ headless: true });

    // Create an explicit browser context for isolated test execution.
    const context = await browser.newContext();

    // Open the desktop page inside the explicit browser context.
    const desktop = await context.newPage();

    await desktop.setViewportSize({
        width: 1440,
        height: 900,
    });

    // Open the homepage and inspect the final page after any redirects.
    await desktop.goto(baseUrl);

    console.log("Final URL:", desktop.url());
    console.log("Page title:", await desktop.title());
    console.log("Visible headings:", await desktop.getByRole("heading").allTextContents());

    const desktopColors = await desktop.evaluate(() => ({
        background: getComputedStyle(document.body).backgroundColor,
        primary: getComputedStyle(document.body).color,
        secondary: getComputedStyle(document.querySelector(".login-hero-title span")).color,
    }));

    if (desktopColors.background !== "rgb(255, 255, 255)") {
        throw new Error(`Unexpected background color: ${desktopColors.background}`);
    }

    if (desktopColors.primary !== "rgb(18, 59, 115)") {
        throw new Error(`Unexpected primary color: ${desktopColors.primary}`);
    }

    // Verify the priority text uses the SaludVital teal accent.
    if (desktopColors.secondary !== "rgb(8, 127, 115)") {
        throw new Error(`Unexpected secondary text color: ${desktopColors.secondary}`);
    }

    console.log("PASS: homepage and brand colors on desktop.");

    // Open the mobile page in the same browser context.
    const mobile = await context.newPage();

    await mobile.setViewportSize({
        width: 375,
        height: 812,
    });

    await mobile.goto(baseUrl);

    const hasHorizontalOverflow = await mobile.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
    );

    if (hasHorizontalOverflow) {
        throw new Error("The mobile layout has horizontal overflow.");
    }

    console.log("PASS: mobile layout has no horizontal overflow.");

    // Test the login page across mobile, tablet, and desktop viewports.
    const loginPage = await context.newPage();

    const loginViewports = [
        { name: "small mobile", width: 320, height: 720 },
        { name: "mobile", width: 375, height: 812 },
        { name: "tablet", width: 768, height: 1024 },
        { name: "Surface Pro portrait", width: 912, height: 1368 },
        { name: "iPad Pro 13 portrait", width: 1032, height: 1376 },
        { name: "small desktop", width: 1200, height: 800 },
        { name: "iPad Pro 13 landscape", width: 1366, height: 1024 },
        { name: "Surface Pro landscape", width: 1440, height: 960 },
    ];

    for (const viewport of loginViewports) {
        await loginPage.setViewportSize({
            width: viewport.width,
            height: viewport.height,
        });

        const loginNavigationStartedAt = Date.now();
        await loginPage.goto(`${baseUrl}/login`);

        if (viewport.width === 1440 || viewport.width === 320) {
            const splash = loginPage.locator("[data-login-splash]");
            await splash.waitFor({ state: "visible" });
            const splashWidth = await loginPage.evaluate(
                () => document.documentElement.scrollWidth,
            );
            if (splashWidth > viewport.width) {
                throw new Error(`Splash screen overflows at ${viewport.width}px.`);
            }
            if (viewport.width === 1440) {
                await loginPage.waitForTimeout(350);
                await loginPage.screenshot({ path: "test-results/login-splash-desktop.png" });
                await loginPage.locator(".login-splash-logo").evaluate((image) => {
                    if (!image.complete || image.naturalWidth === 0) {
                        throw new Error("The official logo did not load in the splash screen.");
                    }
                });
                await splash.waitFor({ state: "detached", timeout: 6500 });
                const splashDuration = Date.now() - loginNavigationStartedAt;
                if (splashDuration < 4700) {
                    throw new Error(`Splash ended too early (${splashDuration}ms).`);
                }
                await loginPage.locator('input[name="email"]').fill("patient@example.com");
                await loginPage.locator('input[name="password"]').fill("SafeTestPassword123!");
            }
        }

        // Verify that the login form and its main controls are available.
        await loginPage.locator('input[name="email"]').waitFor();
        await loginPage.locator('input[name="password"]').waitFor();

        const passwordToggle = loginPage.getByRole("button", { name: "Mostrar contraseña" });
        await passwordToggle.click();
        if ((await loginPage.locator('input[name="password"]').getAttribute("type")) !== "text") {
            throw new Error("The login password visibility control did not reveal the password.");
        }
        await loginPage.getByRole("button", { name: "Ocultar contraseña" }).click();

        if (await loginPage.getByLabel("Recordarme").count()) {
            throw new Error("The login page must not offer a persistent-session option.");
        }

        await loginPage.locator('a[href="/forgot-password"]').waitFor();
        await loginPage.locator('a[href="/register"]').waitFor();

        const emailInput = loginPage.locator('input[name="email"]');
        const passwordInput = loginPage.locator('input[name="password"]');
        const submitButton = loginPage.locator('button[type="submit"]');

        if (
            !(await emailInput.isVisible()) ||
            !(await passwordInput.isVisible()) ||
            !(await submitButton.isVisible())
        ) {
            throw new Error(`Login form controls are not visible at ${viewport.name}.`);
        }

        // Detect horizontal overflow at the current viewport width.
        const layout = await loginPage.evaluate(() => ({
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            viewportWidth: window.innerWidth,
        }));

        if (
            layout.documentWidth > layout.viewportWidth ||
            layout.bodyWidth > layout.viewportWidth
        ) {
            throw new Error(
                `Login page has horizontal overflow at ${viewport.name}: ${JSON.stringify(layout)}`,
            );
        }

        const responsiveComposition = await loginPage.evaluate(() => ({
            visualDisplay: getComputedStyle(document.querySelector(".login-visual")).display,
            mobileHeroDisplay: getComputedStyle(document.querySelector(".login-mobile-hero"))
                .display,
            formWidth: document.querySelector(".login-form-wrap").getBoundingClientRect().width,
        }));

        const usesStackedLayout = viewport.width < 1200;
        if (
            (usesStackedLayout &&
                (responsiveComposition.visualDisplay !== "none" ||
                    responsiveComposition.mobileHeroDisplay === "none")) ||
            (!usesStackedLayout &&
                (responsiveComposition.visualDisplay === "none" ||
                    responsiveComposition.mobileHeroDisplay !== "none")) ||
            responsiveComposition.formWidth > viewport.width
        ) {
            throw new Error(
                `Login composition does not fit ${viewport.name}: ${JSON.stringify(responsiveComposition)}`,
            );
        }

        if (viewport.width <= 430) {
            const mobileLayout = await loginPage.evaluate(() => {
                const brand = document.querySelector(".login-mobile-hero").getBoundingClientRect();
                const form = document.querySelector(".login-form-wrap").getBoundingClientRect();

                return {
                    brandBottom: brand.bottom,
                    formTop: form.top,
                    formWidth: form.width,
                    viewportWidth: window.innerWidth,
                    visibleBrandCount: [...document.querySelectorAll(".login-brand-logo")].filter(
                        (logo) => logo.getClientRects().length > 0,
                    ).length,
                    mobileWhatsAppCount: document.querySelectorAll(".login-mobile-whatsapp").length,
                    desktopWhatsAppCount:
                        document.querySelectorAll(".login-whatsapp-banner").length,
                };
            });

            if (
                mobileLayout.brandBottom > mobileLayout.formTop ||
                mobileLayout.formWidth < mobileLayout.viewportWidth * 0.78 ||
                mobileLayout.visibleBrandCount !== 1 ||
                mobileLayout.mobileWhatsAppCount !== 1 ||
                mobileLayout.desktopWhatsAppCount !== 1
            ) {
                throw new Error(
                    `Login content is not stacked at ${viewport.name}: ${JSON.stringify(mobileLayout)}`,
                );
            }

            if (viewport.width === 375) {
                await loginPage.screenshot({
                    path: "test-results/login-mobile-current.png",
                    fullPage: true,
                });
            }
        }

        if (viewport.width === 1440) {
            await loginPage.screenshot({
                path: "test-results/login-desktop-current.png",
                fullPage: true,
            });
        }

        if (
            viewport.name === "Surface Pro portrait" ||
            viewport.name === "iPad Pro 13 portrait" ||
            viewport.name === "iPad Pro 13 landscape"
        ) {
            await loginPage.screenshot({
                path: `test-results/login-${viewport.name.toLowerCase().replaceAll(" ", "-")}.png`,
                fullPage: true,
            });
        }

        // Ensure visible images have loaded successfully.
        const brokenImages = await loginPage
            .locator("img")
            .evaluateAll((images) =>
                images
                    .filter(
                        (image) =>
                            image.getClientRects().length > 0 &&
                            (!image.complete || image.naturalWidth === 0),
                    )
                    .map((image) => image.getAttribute("src")),
            );

        if (brokenImages.length > 0) {
            throw new Error(
                `Broken visible images at ${viewport.name}: ${brokenImages.join(", ")}`,
            );
        }

        console.log(
            `PASS: login responsive layout at ${viewport.name} (${viewport.width}x${viewport.height}).`,
        );
    }

    const noScriptPage = await context.newPage();
    await noScriptPage.route("**/js/login-splash.js", (route) => route.abort());
    await noScriptPage.setViewportSize({ width: 375, height: 812 });
    await noScriptPage.goto(`${baseUrl}/login`);
    await noScriptPage.locator("[data-login-splash]").waitFor({ state: "hidden", timeout: 6500 });
    await noScriptPage.locator('input[name="email"]').fill("patient@example.com");
    console.log("PASS: CSS fallback reveals a usable login when splash JavaScript fails.");

    const failedDecorationPage = await context.newPage();
    await failedDecorationPage.route("**/brand/login/girl.png", (route) => route.abort());
    await failedDecorationPage.goto(`${baseUrl}/login`);
    await failedDecorationPage.locator("[data-login-splash]").waitFor({
        state: "detached",
        timeout: 6500,
    });
    await failedDecorationPage.locator('input[name="email"]').waitFor({ state: "visible" });
    console.log("PASS: a failed decorative image does not block login access.");

    const reducedMotionContext = await browser.newContext({ reducedMotion: "reduce" });
    const reducedMotionPage = await reducedMotionContext.newPage();
    await reducedMotionPage.goto(`${baseUrl}/login`);
    await reducedMotionPage.locator("[data-login-splash]").waitFor({ state: "detached" });
    await reducedMotionPage.locator('input[name="email"]').waitFor({ state: "visible" });
    await reducedMotionContext.close();
    console.log("PASS: reduced-motion users reach the login without the splash animation.");

    // Check login accessibility on both mobile and desktop.
    for (const viewport of [
        { name: "mobile", width: 375, height: 812 },
        { name: "desktop", width: 1440, height: 900 },
    ]) {
        await loginPage.setViewportSize({
            width: viewport.width,
            height: viewport.height,
        });

        await loginPage.goto(`${baseUrl}/login`);

        const loginAccessibility = await new AxeBuilder({
            page: loginPage,
        }).analyze();

        if (loginAccessibility.violations.length > 0) {
            console.error(JSON.stringify(loginAccessibility.violations, null, 2));

            throw new Error(
                `Login accessibility check found ${loginAccessibility.violations.length} violation(s) at ${viewport.name}.`,
            );
        }

        console.log(`PASS: login accessibility at ${viewport.name}.`);
    }

    // Verify the recovery request and reset screens across narrow, tablet, and desktop layouts.
    const recoveryPage = await context.newPage();
    const recoveryViewports = [
        { name: "small mobile", width: 320, height: 720 },
        { name: "mobile", width: 375, height: 812 },
        { name: "tablet", width: 760, height: 1024 },
        { name: "desktop", width: 1440, height: 900 },
    ];

    for (const viewport of recoveryViewports) {
        await recoveryPage.setViewportSize({
            width: viewport.width,
            height: viewport.height,
        });
        await recoveryPage.goto(`${baseUrl}/forgot-password`);
        await recoveryPage.getByRole("heading", { name: "¿Olvidaste tu contraseña?" }).waitFor();
        await recoveryPage.locator('[data-image-slot="forgot-password"]').waitFor();
        await recoveryPage.locator('form[action="/forgot-password"] input[name="email"]').waitFor();
        await recoveryPage.locator('.recovery-whatsapp[href^="https://wa.me/"]').waitFor();

        const recoveryLayout = await recoveryPage.evaluate(() => ({
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            viewportWidth: window.innerWidth,
            cardWidth: document.querySelector(".recovery-card").getBoundingClientRect().width,
            panelWidth: document.querySelector(".recovery-panel").getBoundingClientRect().width,
            visualDisplay: getComputedStyle(document.querySelector(".recovery-visual")).display,
            mobileHeroDisplay: getComputedStyle(document.querySelector(".recovery-mobile-hero"))
                .display,
        }));

        if (
            recoveryLayout.documentWidth > recoveryLayout.viewportWidth ||
            recoveryLayout.bodyWidth > recoveryLayout.viewportWidth ||
            recoveryLayout.cardWidth > recoveryLayout.panelWidth
        ) {
            throw new Error(
                `Recovery page overflows at ${viewport.name}: ${JSON.stringify(recoveryLayout)}`,
            );
        }

        const usesDesktopComposition = viewport.width >= 1200;
        if (
            (usesDesktopComposition && recoveryLayout.visualDisplay === "none") ||
            (!usesDesktopComposition && recoveryLayout.mobileHeroDisplay === "none")
        ) {
            throw new Error(
                `Recovery composition is incorrect at ${viewport.name}: ${JSON.stringify(recoveryLayout)}`,
            );
        }

        await recoveryPage.goto(`${baseUrl}/reset-password?token=visual-test-token`);
        await recoveryPage.getByRole("heading", { name: "Crea tu nueva contraseña" }).waitFor();
        await recoveryPage.locator('[data-image-slot="reset-password"]').waitFor();
        await recoveryPage.locator('input[name="password"]').fill("RecoveryTest123!");
        await recoveryPage.getByRole("button", { name: "Mostrar contraseña" }).first().click();

        if (
            (await recoveryPage.locator('input[name="password"]').getAttribute("type")) !== "text"
        ) {
            throw new Error(`Password visibility toggle failed at ${viewport.name}.`);
        }

        console.log(`PASS: password recovery responsive flow at ${viewport.name}.`);
    }

    for (const viewport of [
        { name: "mobile", width: 375, height: 812 },
        { name: "desktop", width: 1440, height: 900 },
    ]) {
        await recoveryPage.setViewportSize({ width: viewport.width, height: viewport.height });
        await recoveryPage.goto(`${baseUrl}/forgot-password`);

        const recoveryAccessibility = await new AxeBuilder({ page: recoveryPage }).analyze();
        if (recoveryAccessibility.violations.length > 0) {
            console.error(JSON.stringify(recoveryAccessibility.violations, null, 2));
            throw new Error(
                `Password recovery accessibility check found ${recoveryAccessibility.violations.length} violation(s) at ${viewport.name}.`,
            );
        }

        await recoveryPage.goto(`${baseUrl}/reset-password?token=visual-test-token`);
        const resetAccessibility = await new AxeBuilder({ page: recoveryPage }).analyze();
        if (resetAccessibility.violations.length > 0) {
            console.error(JSON.stringify(resetAccessibility.violations, null, 2));
            throw new Error(
                `Password reset accessibility check found ${resetAccessibility.violations.length} violation(s) at ${viewport.name}.`,
            );
        }
    }

    console.log("PASS: recovery request and reset accessibility at mobile and desktop.");
    await recoveryPage.close();

    for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await loginPage.request.post(`${baseUrl}/login`, {
            form: {
                email: `missing-lock-${attempt}@example.test`,
                password: "WrongPassword123!",
            },
        });

        if (response.status() !== 401) {
            throw new Error(
                `Unexpected login response before the IP threshold: ${response.status()}.`,
            );
        }
    }

    await loginPage.goto(`${baseUrl}/login`);
    await loginPage.locator('input[name="email"]').fill("blocked@example.test");
    await loginPage.locator('input[name="password"]').fill("WrongPassword123!");
    await loginPage.locator('button[type="submit"]').click();
    await loginPage.locator("[data-login-lock-countdown]").waitFor();

    if (
        !(await loginPage.locator('input[name="email"]').isDisabled()) ||
        !(await loginPage.locator('input[name="password"]').isDisabled()) ||
        !(await loginPage.locator('button[type="submit"]').isDisabled())
    ) {
        throw new Error("Login controls remained active while the IP lock was in effect.");
    }

    await loginPage.locator("[data-login-lock-countdown]").evaluate((element) => {
        element.dataset.lockUntil = String(Date.now() + 1200);
    });
    await loginPage.locator('input[name="email"]:not(:disabled)').waitFor({ timeout: 3000 });

    if (!(await loginPage.getByRole("alert").textContent()).includes("El bloqueo terminó")) {
        throw new Error("The login lock message was not updated when its countdown expired.");
    }

    console.log(
        "PASS: login controls are disabled during the lock and enabled after countdown expiry.",
    );

    await loginPage.close();

    // Verify patient registration across responsive viewports.
    const registerPage = await context.newPage();

    const registrationViewports = [
        { name: "small mobile", width: 320, height: 720 },
        { name: "mobile", width: 375, height: 812 },
        { name: "tablet", width: 768, height: 1024 },
        { name: "small desktop", width: 1024, height: 768 },
        { name: "desktop", width: 1440, height: 900 },
    ];

    for (const viewport of registrationViewports) {
        await registerPage.setViewportSize({
            width: viewport.width,
            height: viewport.height,
        });

        await registerPage.goto(`${baseUrl}/register`);

        // Wait for the registration form and location catalog.
        await registerPage.locator('form[action="/register"]').waitFor();
        const departmentSelect = registerPage.locator("#department");
        const municipalitySelect = registerPage.locator("#municipality");

        // Wait until the department option exists in the DOM.
        await departmentSelect.locator('option[value="66"]').waitFor({
            state: "attached",
        });

        if (!(await departmentSelect.isVisible())) {
            throw new Error(`Department selector is not visible at ${viewport.name}.`);
        }

        if (!(await municipalitySelect.isVisible())) {
            throw new Error(`Municipality selector is not visible at ${viewport.name}.`);
        }

        // Confirm the form has no horizontal overflow at this viewport.
        const layout = await registerPage.evaluate(() => ({
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            viewportWidth: window.innerWidth,
        }));

        if (
            layout.documentWidth > layout.viewportWidth ||
            layout.bodyWidth > layout.viewportWidth
        ) {
            throw new Error(
                `Registration page has horizontal overflow at ${viewport.name}: ${JSON.stringify(layout)}`,
            );
        }

        console.log(
            `PASS: registration responsive layout at ${viewport.name} (${viewport.width}x${viewport.height}).`,
        );
    }

    // Verify that municipality options depend on the selected department.
    await registerPage.goto(`${baseUrl}/register`);

    const departmentSelect = registerPage.locator("#department");
    const municipalitySelect = registerPage.locator("#municipality");

    // Wait until the department option is present in the DOM.
    await departmentSelect.locator('option[value="66"]').waitFor({
        state: "attached",
    });

    console.log("PASS: municipalities load for the selected department.");

    // Change departments and verify that the previous municipality is cleared.
    await departmentSelect.selectOption("66");

    // Wait until the municipality option exists in the DOM.
    await municipalitySelect.locator('option[value="66001"]').waitFor({
        state: "attached",
    });

    if (await municipalitySelect.isDisabled()) {
        throw new Error("Municipality selector remained disabled after loading.");
    }

    console.log("PASS: changing departments clears the previous municipality.");

    // Change departments and verify that the previous municipality is cleared.
    await departmentSelect.selectOption("05");

    // Wait until the municipality option for the new department exists.
    await municipalitySelect.locator('option[value="05001"]').waitFor({
        state: "attached",
    });

    if ((await municipalitySelect.inputValue()) !== "") {
        throw new Error("Changing the department did not clear the previous municipality.");
    }

    // Verify registration form accessibility on mobile and desktop.
    for (const viewport of [
        { name: "mobile", width: 375, height: 812 },
        { name: "desktop", width: 1440, height: 900 },
    ]) {
        await registerPage.setViewportSize({
            width: viewport.width,
            height: viewport.height,
        });

        await registerPage.goto(`${baseUrl}/register`);

        // Wait until the department option is present in the DOM.
        await registerPage
            .locator("#department")
            .locator('option[value="66"]')
            .waitFor({ state: "attached" });

        const registrationAccessibility = await new AxeBuilder({
            page: registerPage,
        }).analyze();

        if (registrationAccessibility.violations.length > 0) {
            console.error(JSON.stringify(registrationAccessibility.violations, null, 2));

            throw new Error(
                `Registration accessibility check found ${registrationAccessibility.violations.length} violation(s) at ${viewport.name}.`,
            );
        }

        console.log(`PASS: registration accessibility at ${viewport.name}.`);
    }

    await registerPage.close();

    // Run automated accessibility checks with axe-core.
    const accessibility = await new AxeBuilder({ page: desktop }).analyze();

    if (accessibility.violations.length > 0) {
        console.error(JSON.stringify(accessibility.violations, null, 2));

        throw new Error(
            `Accessibility check found ${accessibility.violations.length} violation(s).`,
        );
    }

    console.log("PASS: axe-core found no accessibility violations.");
} finally {
    // Release browser resources and stop the test server even if a check fails.
    if (browser) {
        await browser.close();
    }

    server.kill();
}
