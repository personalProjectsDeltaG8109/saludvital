import { readFile } from "node:fs/promises";
import path from "node:path";
import pug from "pug";
import { chromium } from "playwright";

const dashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const profileStyles = await readFile(path.resolve("public/css/admin-profile.css"), "utf8");
const html = pug.renderFile(path.resolve("views/admin/profile.pug"), {
    pageTitle: "Mi perfil | SaludVital",
    adminName: "Laura Méndez",
    profile: {
        displayName: "Laura Méndez",
        email: "laura@example.com",
        role: "Administrator",
        isActive: true,
        createdAt: new Date("2025-01-15T10:00:00.000Z"),
        lastLoginAt: new Date("2026-10-27T10:24:00.000Z"),
        initials: "LM",
    },
});

const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await page.setContent(html);
    await page.addStyleTag({ content: dashboardStyles });
    await page.addStyleTag({ content: profileStyles });

    for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const hasHorizontalOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
        );
        if (hasHorizontalOverflow) {
            throw new Error(`The administrator profile overflows horizontally at ${width}px.`);
        }
    }

    await page.setViewportSize({ width: 375, height: 812 });
    const navigation = page.getByRole("navigation", { name: "Secciones del perfil" });
    await navigation.getByRole("link", { name: "Información personal" }).focus();
    if (
        !(await navigation
            .getByRole("link", { name: "Información personal" })
            .evaluate((link) => link === document.activeElement))
    ) {
        throw new Error("Profile navigation must support keyboard focus.");
    }

    console.log(
        "PASS: administrator profile renders without overflow at mobile, tablet, and desktop widths.",
    );
    console.log("PASS: profile section links can receive keyboard focus.");
} finally {
    await browser.close();
}
