import { readFile } from "node:fs/promises";
import path from "node:path";
import pug from "pug";
import { chromium } from "playwright";

const dashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const profileStyles = await readFile(path.resolve("public/css/admin-profile.css"), "utf8");
const profileScript = await readFile(path.resolve("public/js/admin-profile.js"), "utf8");
const profilePhotoScript = await readFile(path.resolve("public/js/admin-profile-photo.js"), "utf8");
const html = pug.renderFile(path.resolve("views/admin/profile.pug"), {
    pageTitle: "Mi perfil | SaludVital",
    adminName: "Laura Méndez",
    profile: {
        displayName: "Laura Méndez",
        email: "laura@example.com",
        emailVerified: true,
        phone: "+573001234567",
        role: "Administrator",
        isActive: true,
        createdAt: new Date("2025-01-15T10:00:00.000Z"),
        lastLoginAt: new Date("2026-10-27T10:24:00.000Z"),
        profilePhotoUrl: null,
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
        window.photoSaveMode = "error";
        window.photoRemoveConfirmed = true;
        window.confirmCalls = 0;
        window.confirm = () => {
            window.confirmCalls += 1;
            return window.photoRemoveConfirmed;
        };
        window.fetch = async (url, options = {}) => {
            if (String(url).endsWith("/photo")) {
                if (options.method === "DELETE") {
                    return { ok: true, json: async () => ({ profilePhotoUrl: null }) };
                }
                return window.photoSaveMode === "error"
                    ? { ok: false, json: async () => ({ message: "No pudimos guardar la foto." }) }
                    : {
                          ok: true,
                          json: async () => ({
                              profilePhotoUrl: "/uploads/profile-photos/new.png",
                              message: "Tu foto de perfil se actualizó correctamente.",
                          }),
                      };
            }
            return window.profileSaveMode === "error"
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
        };
    });
    await page.addScriptTag({ content: profileScript });
    await page.addScriptTag({ content: profilePhotoScript });

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
    await page.getByRole("link", { name: "Recuperar contraseña" }).waitFor();
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

    const photoButton = page.getByRole("button", { name: "Opciones de foto de perfil" });
    await photoButton.focus();
    await page.keyboard.press("Enter");
    const photoDialog = page.getByRole("dialog", { name: "Foto de perfil" });
    await photoDialog.waitFor();
    if (await photoDialog.getByRole("button", { name: "Eliminar foto" }).isVisible()) {
        throw new Error("The remove-photo action must be hidden when no photo exists.");
    }
    await photoDialog.getByRole("button", { name: "Subir o cambiar foto" }).click();
    await page.locator("[data-profile-photo-input]").setInputFiles({
        name: "profile.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from("<svg></svg>"),
    });
    await photoDialog
        .getByRole("alert")
        .getByText("Selecciona una foto JPG, PNG o WEBP.")
        .waitFor();
    await page.locator("[data-profile-photo-input]").setInputFiles({
        name: "large.png",
        mimeType: "image/png",
        buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
    });
    await photoDialog
        .getByRole("alert")
        .getByText("La foto debe pesar como máximo 2 MB.")
        .waitFor();
    await page.locator("[data-profile-photo-input]").setInputFiles({
        name: "profile.png",
        mimeType: "image/png",
        buffer: Buffer.from("png-test-data"),
    });
    await photoDialog.locator("[data-photo-preview-container]:not([hidden])").waitFor();
    await photoDialog.getByRole("button", { name: "Guardar foto" }).click();
    await photoDialog.getByRole("alert").getByText("No pudimos guardar la foto.").waitFor();
    if (await page.locator("[data-profile-avatar-image]").count()) {
        throw new Error("A failed upload must preserve the current avatar.");
    }
    if ((await page.locator("[data-photo-preview]").getAttribute("src")) === null) {
        throw new Error("The selected photo preview must remain available after upload failure.");
    }

    await page.evaluate(() => {
        window.photoSaveMode = "success";
    });
    await photoDialog.getByRole("button", { name: "Guardar foto" }).click();
    await page
        .locator('[data-profile-avatar-image][src="/uploads/profile-photos/new.png"]')
        .waitFor();
    await photoButton.focus();
    await page.keyboard.press("Enter");
    await photoDialog.getByRole("button", { name: "Eliminar foto" }).waitFor();
    await page.evaluate(() => {
        window.photoRemoveConfirmed = false;
    });
    await photoDialog.getByRole("button", { name: "Eliminar foto" }).click();
    await page.locator("[data-profile-avatar-image]").waitFor();
    if ((await page.evaluate(() => window.confirmCalls)) !== 1) {
        throw new Error("Photo removal must request explicit confirmation.");
    }
    await page.evaluate(() => {
        window.photoRemoveConfirmed = true;
    });
    await photoDialog.getByRole("button", { name: "Eliminar foto" }).click();
    await page.locator("[data-profile-initials]").getByText("LT").waitFor();
    await page
        .getByRole("status")
        .getByText("Tu foto de perfil se eliminó correctamente.")
        .waitFor();

    console.log(
        "PASS: administrator profile renders without overflow at mobile, tablet, and desktop widths.",
    );
    console.log("PASS: profile section links can receive keyboard focus.");
    console.log(
        "PASS: profile editor preserves input after failure and reflects successful saves.",
    );
    console.log(
        "PASS: photo actions are available only from the avatar camera, preserve failed uploads, and remove with confirmation.",
    );
} finally {
    await browser.close();
}
