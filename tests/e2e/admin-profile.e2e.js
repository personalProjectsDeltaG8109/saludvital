import { readFile } from "node:fs/promises";
import path from "node:path";
import pug from "pug";
import { chromium } from "playwright";

const dashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const profileStyles = await readFile(path.resolve("public/css/admin-profile.css"), "utf8");
const profileScript = await readFile(path.resolve("public/js/admin-profile.js"), "utf8");
const html = pug.renderFile(path.resolve("views/admin/profile.pug"), {
    pageTitle: "Mi perfil | SaludVital",
    adminName: "Laura Méndez",
    profile: {
        displayName: "Laura Méndez",
        email: "laura@example.com",
        phone: "+573001234567",
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
    await page.evaluate(() => {
        window.profileSaveMode = "error";
        window.fetch = async () =>
            window.profileSaveMode === "error"
                ? { ok: false, json: async () => ({ message: "No pudimos guardar los cambios." }) }
                : {
                      ok: true,
                      json: async () => ({
                          message: "Tus datos personales se actualizaron correctamente.",
                          profile: {
                              displayName: "Laura Torres",
                              email: "laura.torres@example.com",
                              phone: "3007654321",
                              initials: "LT",
                          },
                      }),
                  };
    });
    await page.addScriptTag({ content: profileScript });

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

    await page.getByRole("button", { name: "Editar" }).focus();
    await page.keyboard.press("Enter");
    if (
        !(await page
            .locator("[data-profile-display-name]")
            .evaluate((input) => input === document.activeElement))
    ) {
        throw new Error("Opening the profile editor must move keyboard focus to the first field.");
    }
    await page.setViewportSize({ width: 320, height: 812 });
    const editorOverflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
    );
    if (editorOverflows)
        throw new Error("The expanded profile editor must fit a 320px mobile screen.");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator("[data-profile-display-name]").fill("Laura Torres");
    await page.locator("[data-profile-email]").fill("laura.torres@example.com");
    await page.locator("[data-profile-phone]").fill("3007654321");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await page.getByRole("alert").getByText("No pudimos guardar los cambios.").waitFor();
    if ((await page.locator("[data-profile-display-name]").inputValue()) !== "Laura Torres") {
        throw new Error("Failed profile saves must preserve entered form values.");
    }

    await page.evaluate(() => {
        window.profileSaveMode = "success";
    });
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await page
        .getByRole("status")
        .getByText("Tus datos personales se actualizaron correctamente.")
        .waitFor();
    await page.getByRole("heading", { name: "Laura Torres" }).waitFor();
    await page.getByText("laura.torres@example.com", { exact: true }).first().waitFor();

    console.log(
        "PASS: administrator profile renders without overflow at mobile, tablet, and desktop widths.",
    );
    console.log("PASS: profile section links can receive keyboard focus.");
    console.log(
        "PASS: profile editor preserves input after failure and reflects successful saves.",
    );
} finally {
    await browser.close();
}
