import { readFile } from "node:fs/promises";
import path from "node:path";
import pug from "pug";
import { chromium } from "playwright";

const dashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const userStyles = await readFile(path.resolve("public/css/admin-users.css"), "utf8");
const userScript = await readFile(path.resolve("public/js/admin-users.js"), "utf8");
const userFixture = {
    users: [
        {
            id: 7,
            displayName: "Dra. Laura Méndez",
            email: "laura.mendez@example.com",
            role: { id: 2, name: "Patient" },
            isActive: true,
            profileType: "Paciente",
            isDoctorProfile: false,
            profilePhotoUrl: null,
            createdAt: "2026-10-30T12:00:00.000Z",
            lastLoginAt: "2026-11-02T12:00:00.000Z",
        },
    ],
    roles: [
        { id: 1, name: "Administrator" },
        { id: 2, name: "Patient" },
        { id: 3, name: "Doctor" },
    ],
    pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
};
const html = pug.renderFile(path.resolve("views/admin/users.pug"), {
    pageTitle: "Usuarios y roles | SaludVital",
    adminName: "Administradora de prueba",
});
const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage({ viewport: { width: 762, height: 900 } });
    await page.setContent(html);
    await page.evaluate((fixture) => {
        window.fetch = async () => ({ ok: true, json: async () => fixture });
    }, userFixture);
    await page.addStyleTag({ content: dashboardStyles });
    await page.addStyleTag({ content: userStyles });
    await page.addScriptTag({ content: userScript });
    await page.waitForTimeout(200);
    if (!(await page.locator(".admin-user-card").count())) {
        throw new Error(
            `User fixture did not render: ${await page.locator("[data-user-feedback]").innerText()}`,
        );
    }

    for (const width of [375, 760, 761, 762, 768, 800, 900, 960, 1000, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const dimensions = await page.evaluate(() => {
            const card = document.querySelector(".admin-user-card");
            const cardBounds = card.getBoundingClientRect();
            const children = [...card.children].map((element) => {
                const { left, right, top, bottom } = element.getBoundingClientRect();
                return { left, right, top, bottom };
            });
            const childrenOverlap = children.some((item, index) =>
                children
                    .slice(index + 1)
                    .some(
                        (other) =>
                            item.left < other.right - 1 &&
                            item.right > other.left + 1 &&
                            item.top < other.bottom - 1 &&
                            item.bottom > other.top + 1,
                    ),
            );

            return {
                viewportWidth: document.documentElement.clientWidth,
                documentWidth: document.documentElement.scrollWidth,
                cardWidth: cardBounds.width,
                cardScrollWidth: card.scrollWidth,
                childrenOverlap,
            };
        });

        if (dimensions.documentWidth > dimensions.viewportWidth) {
            throw new Error(`Users page overflows at ${width}px: ${JSON.stringify(dimensions)}.`);
        }
        if (dimensions.cardScrollWidth > dimensions.cardWidth + 1 || dimensions.childrenOverlap) {
            throw new Error(
                `User card is clipped or overlapping at ${width}px: ${JSON.stringify(dimensions)}.`,
            );
        }
        console.log(`PASS: administrator users layout fits at ${width}px.`);
    }
} finally {
    await browser.close();
}
