import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const formScript = await readFile(path.resolve("public/js/admin-doctor-form.js"), "utf8");
const browser = await chromium.launch({ headless: true });

const formMarkup = `
    <!doctype html>
    <html lang="es">
        <body>
            <main data-doctor-form data-action="/api/admin/doctors">
                <form data-form novalidate>
                    <input name="displayName" required maxlength="120">
                    <select name="specialtyId" required>
                        <option value="">Selecciona una especialidad</option>
                        <option value="3">Medicina General</option>
                    </select>
                    <textarea name="professionalInformation" maxlength="5000"></textarea>
                    <input name="email" type="email" required maxlength="320">
                    <input name="password" type="password" required minlength="10" maxlength="50">
                    <input data-photo-input type="file" accept="image/jpeg,image/png,image/webp">
                    <div data-photo-preview></div>
                    <button type="button" data-photo-remove hidden>Quitar foto</button>
                    <p data-form-feedback role="status" aria-live="polite"></p>
                    <button type="submit">Crear médico</button>
                </form>
                <section data-form-success hidden>
                    <p data-form-success-message role="status" aria-live="polite"></p>
                </section>
            </main>
        </body>
    </html>`;

try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => console.error("Browser page error:", error));
    const requests = [];
    let shouldFail = true;

    await page.route("**/admin/doctors/new", (route) =>
        route.fulfill({ contentType: "text/html", body: formMarkup }),
    );
    await page.route("**/api/admin/doctors", async (route) => {
        requests.push(route.request().postDataJSON());
        if (shouldFail) {
            shouldFail = false;
            return route.fulfill({
                status: 422,
                contentType: "application/json",
                body: JSON.stringify({
                    message: "La especialidad seleccionada no está disponible.",
                }),
            });
        }

        return route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify({ message: "Médico creado correctamente." }),
        });
    });

    await page.goto("http://localhost/admin/doctors/new");
    if (!(await page.locator("[data-form]").count())) {
        throw new Error("The doctor form fixture did not load.");
    }
    await page.addScriptTag({ content: formScript });

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();
    if (requests.length !== 0) throw new Error("An invalid empty doctor form was submitted.");

    await page.locator('[name="displayName"]').fill("Dra. Prueba");
    await page.locator('[name="specialtyId"]').selectOption("3");
    await page.locator('[name="professionalInformation"]').fill("Atención general.");
    await page.locator('[name="email"]').fill("doctor@example.com");
    await page.locator('[name="password"]').fill("MedicoSeguro123!");

    await submitButton.click();
    await page.getByText("La especialidad seleccionada no está disponible.").waitFor();
    if ((await page.locator('[name="displayName"]').inputValue()) !== "Dra. Prueba") {
        throw new Error("The form did not preserve values after a recoverable server error.");
    }
    if (!(await submitButton.isEnabled())) {
        throw new Error("The submit button remained disabled after a recoverable error.");
    }

    await submitButton.click();
    await page.locator("[data-form-success]:not([hidden])").waitFor();

    const submittedDoctor = requests[0];
    if (submittedDoctor.specialtyId !== 3) {
        throw new Error("The selected specialty ID was not submitted as a number.");
    }
    if ("photo" in submittedDoctor) {
        throw new Error("An empty photo field was included in the create request.");
    }
    if (requests.length !== 2) throw new Error("The successful retry did not submit exactly once.");

    console.log(
        "PASS: doctor form validates required fields, preserves recoverable errors, and submits a successful retry.",
    );
} finally {
    await browser.close();
}
