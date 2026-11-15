import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "playwright";

const rolePages = [
    { role: "patient", path: "/patient/dashboard" },
    { role: "doctor", path: "/doctor/dashboard" },
    { role: "administrator", path: "/admin/dashboard" },
];
let sessionEnded = false;
const server = createServer((request, response) => {
    const requestPath = new URL(request.url, "http://localhost").pathname;
    response.setHeader("Cache-Control", "no-store");

    if (requestPath === "/logout") {
        sessionEnded = true;
        response.statusCode = 303;
        response.setHeader("Location", "/login");
        response.setHeader("Set-Cookie", "token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax");
        return response.end();
    }

    if (requestPath === "/login") {
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        return response.end("<main>Inicia sesión</main>");
    }

    const protectedPage = rolePages.find(({ path }) => path === requestPath);
    if (protectedPage) {
        if (sessionEnded || !request.headers.cookie?.includes("token=active-session")) {
            response.statusCode = 303;
            response.setHeader("Location", "/login");
            return response.end();
        }

        response.setHeader("Content-Type", "text/html; charset=utf-8");
        return response.end(`<main>Private ${protectedPage.role} information</main>`);
    }

    response.statusCode = 404;
    return response.end("Not found");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
});

try {
    for (const { role, path } of rolePages) {
        sessionEnded = false;
        const context = await browser.newContext();
        await context.addCookies([
            { name: "token", value: "active-session", url: baseUrl, httpOnly: true },
        ]);

        const page = await context.newPage();

        await page.goto(`${baseUrl}${path}`);
        assert.match(await page.locator("main").textContent(), new RegExp(`Private ${role}`));

        await page.goto(`${baseUrl}/logout`);
        await page.waitForURL(`${baseUrl}/login`);
        await page.goBack({ waitUntil: "domcontentloaded" });
        await page.waitForURL(`${baseUrl}/login`);

        assert.equal(await page.locator("main").textContent(), "Inicia sesión");

        await context.close();
        console.log(`PASS ${role}: browser Back returns to sign-in after logout.`);
    }
} finally {
    await browser.close();
    await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
    );
}
