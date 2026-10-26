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
                <header class="specialty-form-heading"><div><h1>Nueva especialidad</h1><p>Agrega una especialidad al catálogo médico.</p></div></header>
                <form class="specialty-form-card" data-specialty-create-form data-endpoint="/api/admin/specialties">
                    <label class="specialty-form-field">Nombre de la especialidad <input name="name" maxlength="100" required></label>
                    <label class="specialty-form-field">Descripción <textarea name="description" maxlength="255"></textarea></label>
                    <p class="specialty-form-feedback" data-specialty-form-feedback></p>
                    <p class="specialty-form-error" role="alert" data-specialty-form-error hidden></p>
                    <footer class="specialty-form-actions">
                        <a class="specialty-form-cancel" href="/admin/specialties">Cancelar</a>
                        <button class="specialty-form-submit" type="submit" data-specialty-submit>Crear especialidad</button>
                    </footer>
                </form>
            </main>
        </body>
    </html>`;

const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route("**/admin/specialties/new", (route) =>
        route.fulfill({ contentType: "text/html", body: formMarkup }),
    );
    await page.route("**/admin/specialties?*", (route) =>
        route.fulfill({
            contentType: "text/html",
            body: "<main data-specialty-catalog>Catálogo de especialidades</main>",
        }),
    );
    let createRequests = 0;
    await page.route("**/api/admin/specialties", async (route) => {
        createRequests += 1;
        const body = route.request().postDataJSON();
        if (createRequests === 1) {
            return route.fulfill({
                status: 409,
                contentType: "application/json",
                body: JSON.stringify({ message: "Ya existe una especialidad con ese nombre." }),
            });
        }
        return route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify({
                specialty: {
                    id: 8,
                    name: body.name,
                    description: body.description,
                    isActive: true,
                },
            }),
        });
    });

    await page.goto("http://localhost/admin/specialties/new");
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
                `Specialty form overflows at ${viewport.label}: ${JSON.stringify(width)}`,
            );
        }
        console.log(`PASS: specialty form has no horizontal overflow at ${viewport.label}.`);
    }

    await page.getByRole("button", { name: "Crear especialidad" }).click();
    if (createRequests !== 0) throw new Error("An empty specialty name was submitted.");

    const nameInput = page.locator('[name="name"]');
    const descriptionInput = page.locator('[name="description"]');
    await nameInput.fill("Medicina General");
    await descriptionInput.fill("Atención integral.");
    await nameInput.press("Enter");
    await page.getByText("Ya existe una especialidad con ese nombre.").waitFor();
    if ((await nameInput.inputValue()) !== "Medicina General") {
        throw new Error("The form did not preserve its values after a duplicate-name error.");
    }

    await nameInput.fill("Geriatría");
    await page.getByRole("button", { name: "Crear especialidad" }).click();
    await page.locator("[data-specialty-catalog]").waitFor();
    const destination = new URL(page.url());
    if (destination.searchParams.get("search") !== "Geriatría") {
        throw new Error(
            "Successful creation did not return to the catalog filtered by the new name.",
        );
    }

    console.log(
        "PASS: required name, duplicate error, preserved values, and successful catalog return.",
    );
} finally {
    await browser.close();
}
