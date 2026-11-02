import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import pug from "pug";

const bookingScript = await readFile(
    path.resolve("public/js/patient-appointment-booking.js"),
    "utf8",
);
const bookingHtml = pug.renderFile("views/patient/request-appointment.pug", {
    pageTitle: "Pedir una nueva cita | SaludVital",
    activeNav: "book",
    patientName: "Paciente de prueba",
    patientPhotoUrl: null,
    notificationCount: 0,
    notificationLabel: "Notificaciones",
});
const specialties = [
    { id: 1, name: "Ginecología", description: "Salud de la mujer" },
    { id: 2, name: "Medicina General", description: "Atención primaria" },
    { id: 3, name: "Pediatría", description: "Atención infantil" },
];
const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => console.error(error));
    await page.setContent(bookingHtml);
    await page.evaluate((availableSpecialties) => {
        window.fetch = async (url) => {
            const data = url === "/api/patient/specialties" ? availableSpecialties : [];
            return new Response(JSON.stringify({ success: true, data }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        };
    }, specialties);
    await page.addScriptTag({ content: bookingScript });

    const specialtyCards = page.locator("[data-specialty-id]");
    await specialtyCards.first().waitFor();
    if ((await specialtyCards.count()) !== specialties.length) {
        throw new Error("The page should display the persisted specialty results.");
    }

    const search = page.locator("#specialty-search");
    await search.fill("ginecologia");
    await page.getByRole("button", { name: /Ginecología/ }).waitFor();
    if ((await specialtyCards.count()) !== 1) {
        throw new Error("An unaccented query should match an accented specialty name.");
    }

    await search.fill("  MEDICINA   GENERAL  ");
    await page.getByRole("button", { name: /Medicina General/ }).waitFor();
    if ((await specialtyCards.count()) !== 1) {
        throw new Error("Repeated whitespace and case differences should be normalized.");
    }

    await search.fill("pediatría");
    await page.getByRole("button", { name: /Pediatría/ }).waitFor();
    if ((await specialtyCards.count()) !== 1) {
        throw new Error("An accented query should match the persisted specialty name.");
    }

    await search.fill("neurología");
    await page.getByText("No encontramos especialidades con esa búsqueda.").waitFor();
    if ((await specialtyCards.count()) !== 0) {
        throw new Error("The page should show no specialty cards for unmatched searches.");
    }

    await search.fill("ginecologia");
    await page.getByRole("button", { name: /Ginecología/ }).click();
    await page.getByText("No hay médicos activos disponibles para esta especialidad.").waitFor();
    if (!(await page.locator('[data-specialty-id="1"].is-selected').count())) {
        throw new Error("Search normalization must preserve specialty selection behavior.");
    }

    console.log("Patient appointment specialty search e2e checks passed.");
} finally {
    await browser.close();
}
