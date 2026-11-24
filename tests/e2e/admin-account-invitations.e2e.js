import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import pug from "pug";
import { chromium } from "playwright";

const dashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const userStyles = await readFile(path.resolve("public/css/admin-users.css"), "utf8");
const userScript = await readFile(path.resolve("public/js/admin-users.js"), "utf8");
const renderedHtml = pug.renderFile(path.resolve("views/admin/users.pug"), {
    pageTitle: "Usuarios y roles | SaludVital",
    adminName: "Administrador de prueba",
});
const imageData = new Map();
for (const [, assetPath] of renderedHtml.matchAll(/src="(\/brand\/[^"]+)"/g)) {
    if (imageData.has(assetPath)) continue;
    const source = await readFile(path.resolve("public", assetPath.slice(1)));
    const type = path.extname(assetPath) === ".ico" ? "image/x-icon" : "image/png";
    imageData.set(assetPath, `data:${type};base64,${source.toString("base64")}`);
}
const html = renderedHtml.replace(
    /src="(\/brand\/[^"]+)"/g,
    (_, source) => `src="${imageData.get(source)}"`,
);
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
});

try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.setContent(html);
    await page.evaluate(() => {
        const invitations = [];
        window.fetch = async (url, options = {}) => {
            const pathname = String(url).split("?")[0];
            if (pathname === "/api/admin/account-invitations" && options.method === "POST") {
                const payload = JSON.parse(options.body);
                const invitation = {
                    id: invitations.length + 1,
                    displayName: payload.displayName,
                    email: payload.email,
                    accountType: payload.accountType,
                    role: payload.accountType === "administrator" ? "Administrador" : "Paciente",
                    status: "pending",
                };
                invitations.unshift(invitation);
                return {
                    ok: true,
                    json: async () => ({
                        invitation,
                        message: "Invitación creada. El correo se enviará en breve.",
                    }),
                };
            }
            if (pathname === "/api/admin/account-invitations" || pathname.endsWith("/resend")) {
                return {
                    ok: true,
                    json: async () => ({
                        invitations,
                        message: "Enviamos una nueva invitación al correo registrado.",
                    }),
                };
            }
            if (options.method === "DELETE") {
                const id = Number(pathname.split("/").at(-1));
                const index = invitations.findIndex((item) => item.id === id);
                if (index >= 0) invitations.splice(index, 1);
                return {
                    ok: true,
                    json: async () => ({ message: "La invitación fue cancelada." }),
                };
            }
            return {
                ok: true,
                json: async () => ({
                    users: [],
                    roles: [
                        { id: 1, name: "Administrator" },
                        { id: 2, name: "Patient" },
                    ],
                    specialties: [],
                    pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 },
                }),
            };
        };
        window.confirm = () => true;
    });
    await page.addStyleTag({ content: dashboardStyles });
    await page.addStyleTag({ content: userStyles });
    await page.addScriptTag({ content: userScript });
    await page.waitForSelector(".admin-invitations-empty");

    await page.getByRole("button", { name: "Invitar cuenta" }).click();
    const modal = page.locator("[data-invitation-dialog]");
    await modal.waitFor();
    if (
        !(await modal.innerText()).includes(
            "El paciente completa su información personal y de salud",
        )
    ) {
        throw new Error(
            "The patient invitation does not explain that the patient completes their own consent.",
        );
    }

    await modal.locator("[data-account-role-card]").nth(1).click();
    if (!(await modal.innerText()).includes("confirma su correo y elige su contraseña")) {
        throw new Error(
            "The administrator invitation guidance did not change with the selected account type.",
        );
    }
    await modal.locator("[data-account-role-card]").nth(0).click();
    await modal.getByLabel("Nombre completo").fill("Ana Torres");
    await modal.getByLabel("Correo electrónico").fill("ana.torres@example.com");

    if (process.env.ADMIN_USERS_SCREENSHOT_DIR) {
        await mkdir(process.env.ADMIN_USERS_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({
            path: path.join(
                process.env.ADMIN_USERS_SCREENSHOT_DIR,
                "admin-invitation-modal-desktop.png",
            ),
            fullPage: true,
        });
    }

    await modal.getByRole("button", { name: "Enviar invitación" }).click();
    const invitationRow = page.locator(".admin-invitation-row");
    await invitationRow.waitFor();
    const rowText = await invitationRow.innerText();
    if (
        !rowText.includes("Ana Torres") ||
        !rowText.includes("ana.torres@example.com") ||
        !rowText.includes("Correo pendiente")
    ) {
        throw new Error(`The created invitation is not shown correctly: ${rowText}`);
    }
    console.log("PASS: administrator can create a patient invitation and see its delivery status.");

    if (process.env.ADMIN_USERS_SCREENSHOT_DIR) {
        for (const [name, width, height] of [
            ["desktop", 1440, 1000],
            ["mobile", 390, 844],
        ]) {
            await page.setViewportSize({ width, height });
            await page.screenshot({
                path: path.join(
                    process.env.ADMIN_USERS_SCREENSHOT_DIR,
                    `admin-invitations-${name}.png`,
                ),
                fullPage: true,
            });
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Invitar cuenta" }).click();
    const mobileModal = page.locator("[data-invitation-dialog]");
    const mobileModalBounds = await mobileModal.evaluate((element) => {
        const { left, right, width } = element.getBoundingClientRect();
        return { left, right, width, viewport: document.documentElement.clientWidth };
    });
    if (mobileModalBounds.left < 0 || mobileModalBounds.right > mobileModalBounds.viewport + 1) {
        throw new Error(
            `The invitation form does not fit on mobile: ${JSON.stringify(mobileModalBounds)}.`,
        );
    }
    if (process.env.ADMIN_USERS_SCREENSHOT_DIR) {
        await page.screenshot({
            path: path.join(
                process.env.ADMIN_USERS_SCREENSHOT_DIR,
                "admin-invitation-modal-mobile.png",
            ),
            fullPage: true,
        });
    }
    await page.locator("[data-invitation-cancel]").click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    console.log("PASS: invitation form fits on mobile.");

    await invitationRow.getByRole("button", { name: "Volver a enviar" }).click();
    if (
        !(await page.locator("[data-invitation-feedback]").innerText()).includes(
            "1 invitación pendiente",
        )
    ) {
        throw new Error("The invitation list did not refresh after resending the message.");
    }
    console.log("PASS: pending invitation can be resent.");

    await invitationRow.getByRole("button", { name: "Cancelar invitación" }).click();
    await page.locator(".admin-invitations-empty").waitFor();
    console.log("PASS: pending invitation can be cancelled.");

    for (const width of [375, 390, 600, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const dimensions = await page.evaluate(() => ({
            viewport: document.documentElement.clientWidth,
            page: document.documentElement.scrollWidth,
            overflowingElements: [...document.querySelectorAll("body *")]
                .map((element) => ({
                    selector: `${element.tagName.toLowerCase()}.${String(element.className || "")
                        .trim()
                        .replace(/\s+/g, ".")}`,
                    right: Math.round(element.getBoundingClientRect().right),
                    width: Math.round(element.getBoundingClientRect().width),
                }))
                .filter((item) => item.right > document.documentElement.clientWidth + 1)
                .slice(0, 8),
        }));
        if (dimensions.page > dimensions.viewport) {
            throw new Error(
                `The invitation page overflows at ${width}px: ${JSON.stringify(dimensions)}.`,
            );
        }
        console.log(`PASS: invitations page fits at ${width}px.`);
    }
} finally {
    await browser.close();
}
