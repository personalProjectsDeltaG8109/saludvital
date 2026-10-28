import { readFile } from "node:fs/promises";
import path from "node:path";
import pug from "pug";
import { chromium } from "playwright";

const dashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const profileStyles = await readFile(path.resolve("public/css/admin-profile.css"), "utf8");
const dashboardScript = await readFile(path.resolve("public/js/admin-dashboard.js"), "utf8");
const profileScript = await readFile(path.resolve("public/js/admin-profile.js"), "utf8");
const profilePhotoScript = await readFile(path.resolve("public/js/admin-profile-photo.js"), "utf8");
const profilePreferencesScript = await readFile(
    path.resolve("public/js/admin-profile-preferences.js"),
    "utf8",
);
const validPng = await readFile(path.resolve("public/brand/logo-symbol.png"));
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
        updatedAt: new Date("2026-10-26T10:00:00.000Z"),
        lastLoginAt: new Date("2026-10-27T10:24:00.000Z"),
        emailVerifiedAt: new Date("2026-10-01T10:00:00.000Z"),
        profilePhotoUrl: null,
        adminNotificationsEnabled: true,
        initials: "LM",
    },
});

const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    const htmlWithImagePolicy = html.replace(
        '<meta charset="UTF-8">',
        '<meta http-equiv="Content-Security-Policy" content="img-src \'self\' data:"><meta charset="UTF-8">',
    );
    await page.setContent(htmlWithImagePolicy);
    await page.addStyleTag({ content: dashboardStyles });
    await page.addStyleTag({ content: profileStyles });
    await page.evaluate(() => {
        window.profileSaveMode = "error";
        window.preferenceSaveMode = "error";
        window.photoSaveMode = "error";
        window.photoRemoveConfirmed = true;
        window.confirmCalls = 0;
        window.confirm = () => {
            window.confirmCalls += 1;
            return window.photoRemoveConfirmed;
        };
        window.fetch = async (url, options = {}) => {
            if (String(url).endsWith("/preferences")) {
                return window.preferenceSaveMode === "error"
                    ? {
                          ok: false,
                          json: async () => ({ message: "No pudimos guardar las preferencias." }),
                      }
                    : {
                          ok: true,
                          json: async () => ({
                              showNotificationFeed: false,
                              message:
                                  "Tus preferencias de notificaciones se actualizaron correctamente.",
                          }),
                      };
            }
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
    await page.addScriptTag({ content: dashboardScript });
    await page.addScriptTag({ content: profileScript });
    await page.addScriptTag({ content: profilePhotoScript });
    await page.addScriptTag({ content: profilePreferencesScript });

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
    await page.getByText("Última actualización de la cuenta").waitFor();
    await page.getByText("Correo verificado el").waitFor({ state: "attached" });
    await page.locator('a[href="/forgot-password"]').waitFor({ state: "attached" });
    const menuButton = page.getByRole("button", { name: "Abrir menú" });
    await menuButton.click();
    await page.locator("body.admin-app.is-sidebar-open").waitFor();
    if ((await menuButton.getAttribute("aria-expanded")) !== "true") {
        throw new Error("Opening the mobile sidebar must update its expanded state.");
    }
    await page.locator(".admin-sidebar-collapse").click();
    await page.locator("body.admin-app:not(.is-sidebar-open)").waitFor();
    if ((await menuButton.getAttribute("aria-expanded")) !== "false") {
        throw new Error("Closing the mobile sidebar must restore its collapsed state.");
    }
    console.log("PASS: the shared mobile sidebar opens and closes outside the dashboard page.");

    const navigation = page.getByRole("tablist", { name: "Secciones del perfil" });
    const personalTab = navigation.getByRole("tab", { name: "Información personal" });
    await personalTab.focus();
    await page.keyboard.press("ArrowRight");
    await page.getByRole("tabpanel", { name: "Seguridad de la cuenta" }).waitFor();
    await page.getByText("Correo verificado el").waitFor();
    await page.getByRole("link", { name: "Recuperar contraseña" }).waitFor();
    if (
        !(
            (await navigation
                .getByRole("tab", { name: "Seguridad" })
                .getAttribute("aria-selected")) === "true"
        )
    ) {
        throw new Error("Arrow-key navigation must activate the selected profile tab.");
    }
    await page.keyboard.press("ArrowRight");
    await page.getByRole("tabpanel", { name: "Preferencias de notificaciones" }).waitFor();
    if (await page.locator("#security-information").isVisible()) {
        throw new Error("Only the selected profile section should be visible.");
    }
    await page.keyboard.press("Home");
    await page.getByRole("tabpanel", { name: "Información personal" }).waitFor();

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

    await navigation.getByRole("tab", { name: "Preferencias" }).click();
    await page.getByRole("tabpanel", { name: "Preferencias de notificaciones" }).waitFor();
    const notificationPreference = page.locator("[data-admin-notifications-enabled]");
    await notificationPreference.uncheck();
    await page.getByRole("button", { name: "Guardar preferencias" }).click();
    await page.getByRole("alert").getByText("No pudimos guardar las preferencias.").waitFor();
    if (await notificationPreference.isChecked()) {
        throw new Error("Failed preference saves must preserve the selected value.");
    }
    await page.evaluate(() => {
        window.preferenceSaveMode = "success";
    });
    await page.getByRole("button", { name: "Guardar preferencias" }).click();
    await page
        .getByRole("status")
        .getByText("Tus preferencias de notificaciones se actualizaron correctamente.")
        .waitFor();
    if (await notificationPreference.isChecked()) {
        throw new Error("A successful preference save must reflect the persisted value.");
    }

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
        buffer: validPng,
    });
    await photoDialog.locator("[data-photo-preview-container]:not([hidden])").waitFor();
    const previewIsVisible = await page.locator("[data-photo-preview]").evaluate((image) => {
        return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
    });
    if (!previewIsVisible) {
        throw new Error("The selected image must render in the preview under the image CSP.");
    }
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
    console.log("PASS: profile tabs switch sections and support arrow-key navigation.");
    console.log(
        "PASS: notification preferences preserve edits on failure and confirm successful saves.",
    );
    console.log(
        "PASS: profile editor preserves input after failure and reflects successful saves.",
    );
    console.log(
        "PASS: photo actions are available only from the avatar camera, preserve failed uploads, and remove with confirmation.",
    );
} finally {
    await browser.close();
}
