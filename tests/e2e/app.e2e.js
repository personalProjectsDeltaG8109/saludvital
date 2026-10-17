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
        secondary: getComputedStyle(document.querySelector("main p")).color,
    }));

    if (desktopColors.background !== "rgb(255, 255, 255)") {
        throw new Error(`Unexpected background color: ${desktopColors.background}`);
    }

    if (desktopColors.primary !== "rgb(18, 59, 115)") {
        throw new Error(`Unexpected primary color: ${desktopColors.primary}`);
    }

    // Verify the secondary text uses the accessible teal shade.
    if (desktopColors.secondary !== "rgb(22, 197, 188)") {
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
        { name: "small desktop", width: 1024, height: 768 },
        { name: "desktop", width: 1440, height: 900 },
    ];

    for (const viewport of loginViewports) {
        await loginPage.setViewportSize({
            width: viewport.width,
            height: viewport.height,
        });

        await loginPage.goto(`${baseUrl}/login`);

        // Verify that the login form and its main controls are available.
        await loginPage.locator('input[name="email"]').waitFor();
        await loginPage.locator('input[name="password"]').waitFor();

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

    await loginPage.close();

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
