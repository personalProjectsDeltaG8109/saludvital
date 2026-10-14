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
    // Wait for the application health endpoint to become available.
    let ready = false;

    for (let attempt = 0; attempt < 30; attempt += 1) {
        if (server.exitCode !== null) {
            throw new Error("The SaludVital server stopped unexpectedly.");
        }

        try {
            const response = await fetch(`${baseUrl}/health`);
            ready = response.ok;

            if (ready) break;
        } catch {
            // The server may still be starting.
        }

        await delay(1000);
    }

    if (!ready) {
        throw new Error("The SaludVital server did not become ready.");
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

    await desktop.goto(baseUrl);
    await desktop.getByRole("heading", { name: "SaludVital" }).waitFor();

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

    // Verify the actual accessible color applied to the secondary text.
    if (desktopColors.secondary !== "rgb(18, 59, 115)") {
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
