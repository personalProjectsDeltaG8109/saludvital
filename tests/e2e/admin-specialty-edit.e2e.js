import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const formScript = await readFile(path.resolve("public/js/admin-specialty-form.js"), "utf8");
const dashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const specialtyStyles = await readFile(path.resolve("public/css/admin-specialties.css"), "utf8");

const formMarkup = `
    <!doctype html>
    <html lang="es">
        <body class="admin-app">
            <main class="specialty-form-page">
                <a class="specialty-back-link" href="/admin/specialties">Volver a especialidades</a>
                <header class="specialty-form-heading"><div><h1>Editar especialidad</h1><p>Actualiza los datos de esta especialidad médica.</p></div></header>
                <form class="specialty-form-card" data-specialty-create-form data-mode="edit" data-specialty-id="5" data-current-logo-url="/uploads/specialty-logos/11111111-1111-4111-8111-111111111111.webp" data-endpoint="/api/admin/specialties/5">
                    <label class="specialty-form-field">Nombre de la especialidad <input name="name" maxlength="100" required value="Pediatría"></label>
                    <label class="specialty-form-field">Descripción <textarea name="description" maxlength="255">Atención infantil.</textarea></label>
                    <div class="specialty-form-field">
                        <span>Logo de la especialidad</span>
                        <div class="specialty-logo-control">
                            <span class="specialty-logo-preview" data-specialty-logo-preview></span>
                            <span class="specialty-logo-copy"><strong data-specialty-logo-name>Logo personalizado</strong><small>PNG, JPG o WebP. Máximo 2 MB.</small></span>
                            <label class="specialty-logo-upload">Elegir imagen<input type="file" accept="image/png,image/jpeg,image/webp" data-specialty-logo-input></label>
                            <button type="button" aria-label="Quitar logo personalizado" data-specialty-logo-remove>Quitar logo</button>
                        </div>
                    </div>
                    <aside class="specialty-live-preview">
                        <span class="specialty-live-preview-logo" data-specialty-live-logo></span>
                        <strong data-specialty-live-name>Pediatría</strong>
                        <small data-specialty-live-description>Atención infantil.</small>
                    </aside>
                    <p class="specialty-form-feedback" data-specialty-form-feedback></p>
                    <p class="specialty-form-error" role="alert" data-specialty-form-error hidden></p>
                    <footer class="specialty-form-actions">
                        <a class="specialty-form-cancel" href="/admin/specialties">Cancelar</a>
                        <button class="specialty-form-submit" type="submit" data-specialty-submit>Guardar cambios</button>
                    </footer>
                </form>
            </main>
        </body>
    </html>`;

const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route("**/admin/specialties/5/edit", (route) =>
        route.fulfill({ contentType: "text/html", body: formMarkup }),
    );
    await page.route("**/admin/specialties?*", (route) =>
        route.fulfill({
            contentType: "text/html",
            body: "<main data-specialty-catalog>Catálogo de especialidades</main>",
        }),
    );
    let updateRequests = 0;
    let lastUpdateRequest;
    await page.route("**/api/admin/specialties/5", async (route) => {
        updateRequests += 1;
        lastUpdateRequest = {
            method: route.request().method(),
            body: route.request().postDataJSON(),
        };
        if (updateRequests === 1) {
            return route.fulfill({
                status: 409,
                contentType: "application/json",
                body: JSON.stringify({ message: "Ya existe una especialidad con ese nombre." }),
            });
        }
        return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                specialty: {
                    id: 5,
                    name: lastUpdateRequest.body.name,
                    description: lastUpdateRequest.body.description,
                    isActive: true,
                },
            }),
        });
    });

    await page.goto("http://localhost/admin/specialties/5/edit");
    await page.addStyleTag({ content: dashboardStyles });
    await page.addStyleTag({ content: specialtyStyles });
    await page.addScriptTag({ content: formScript });

    for (const viewport of [
        { label: "mobile", width: 375, height: 812 },
        { label: "tablet", width: 768, height: 1024 },
        { label: "desktop", width: 1440, height: 900 },
    ]) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForTimeout(220);
        const width = await page.evaluate(() => ({
            document: document.documentElement.scrollWidth,
            viewport: window.innerWidth,
        }));
        if (width.document > width.viewport) {
            throw new Error(
                `Specialty edit form overflows at ${viewport.label}: ${JSON.stringify(width)}`,
            );
        }
        console.log(`PASS: specialty edit form has no horizontal overflow at ${viewport.label}.`);
    }

    const nameInput = page.locator('[name="name"]');
    const descriptionInput = page.locator('[name="description"]');
    if (!(await nameInput.inputValue()).startsWith("Pediatr")) {
        throw new Error("The edit form did not show the current specialty name.");
    }
    await nameInput.fill("Medicina General");
    await nameInput.press("Enter");
    await page.getByText("Ya existe una especialidad con ese nombre.").waitFor();
    if (!(await descriptionInput.inputValue()).startsWith("Atenc")) {
        throw new Error("The edit form did not preserve values after a duplicate-name error.");
    }

    await nameInput.fill("Pediatría Clínica");
    await page.getByRole("button", { name: "Quitar logo personalizado" }).click();
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await page.locator("[data-specialty-catalog]").waitFor();
    const destination = new URL(page.url());
    if (lastUpdateRequest.method !== "PATCH") {
        throw new Error("Specialty edits must use PATCH.");
    }
    if (lastUpdateRequest.body.removeLogo !== true) {
        throw new Error("Removing a custom logo was not included in the edit request.");
    }
    if ("is_active" in lastUpdateRequest.body || "specialtyId" in lastUpdateRequest.body) {
        throw new Error("The edit form attempted to modify protected fields.");
    }
    if (destination.searchParams.get("updated") !== "1") {
        throw new Error("Successful edit did not return to the catalog with confirmation.");
    }

    console.log(
        "PASS: current values, duplicate handling, PATCH payload, and successful catalog return.",
    );
} finally {
    await browser.close();
}
