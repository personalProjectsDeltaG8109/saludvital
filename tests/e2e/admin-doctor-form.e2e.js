import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const formScript = await readFile(path.resolve("public/js/admin-doctor-form.js"), "utf8");
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
});

const formMarkup = `
    <!doctype html>
    <html lang="es">
        <body>
            <main data-doctor-form data-action="/api/admin/account-invitations">
                <form data-form novalidate>
                    <input name="email" type="email" required maxlength="320">
                    <select name="specialtyId" required>
                        <option value="">Selecciona una especialidad</option>
                        <option value="3">Medicina General</option>
                    </select>
                    <p class="doctor-invitation-help">El médico completa su perfil.</p>
                    <p data-form-feedback role="status" aria-live="polite"></p>
                    <button type="submit">Enviar invitación</button>
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
    await page.route("**/api/admin/account-invitations", async (route) => {
        requests.push(route.request().postDataJSON());
        if (shouldFail) {
            shouldFail = false;
            return route.fulfill({
                status: 422,
                contentType: "application/json",
                body: JSON.stringify({ message: "La especialidad seleccionada no existe." }),
            });
        }

        return route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify({ message: "Invitación enviada al correo del médico." }),
        });
    });

    await page.goto("http://localhost/admin/doctors/new");
    await page.addScriptTag({ content: formScript });

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();
    if (requests.length !== 0) throw new Error("An invalid empty doctor invitation was submitted.");

    await page.locator('[name="email"]').fill("doctor@example.com");
    await page.locator('[name="specialtyId"]').selectOption("3");
    await submitButton.click();
    await page.getByText("La especialidad seleccionada no existe.").waitFor();
    if ((await page.locator('[name="email"]').inputValue()) !== "doctor@example.com") {
        throw new Error("The form did not preserve values after a recoverable server error.");
    }
    if (!(await submitButton.isEnabled())) {
        throw new Error("The submit button remained disabled after a recoverable error.");
    }

    await submitButton.click();
    await page.locator("[data-form-success]:not([hidden])").waitFor();

    const submittedInvitation = requests[0];
    if (
        submittedInvitation.accountType !== "doctor" ||
        submittedInvitation.specialtyId !== 3 ||
        submittedInvitation.email !== "doctor@example.com"
    ) {
        throw new Error("The doctor invitation did not include the selected specialty and email.");
    }
    if ("password" in submittedInvitation || "displayName" in submittedInvitation) {
        throw new Error(
            "The admin invitation included fields the doctor must complete themselves.",
        );
    }
    if (requests.length !== 2) throw new Error("The successful retry did not submit exactly once.");

    console.log(
        "PASS: admin can invite a doctor, recover from server validation, and avoid collecting a password.",
    );
} finally {
    await browser.close();
}
