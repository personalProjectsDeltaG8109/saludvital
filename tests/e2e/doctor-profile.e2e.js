import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import pug from "pug";
import { chromium } from "playwright";

const stylesheetPaths = [
    "public/css/app.css",
    "public/css/patient-dashboard.css",
    "public/css/doctor-dashboard.css",
    "public/css/doctor-profile.css",
];
const stylesheets = await Promise.all(stylesheetPaths.map((path) => readFile(path, "utf8")));
const html = pug.renderFile("views/doctor/profile.pug", {
    pageTitle: "Mi perfil | SaludVital",
    activeNav: "profile",
    bottomNavActive: "profile",
    doctorName: "Carlos Ramírez",
    doctorPhotoUrl: null,
    profile: {
        fullName: "Carlos Ramírez",
        initials: "CR",
        photoUrl: null,
        specialty: "Medicina General",
        accountStatus: "Cuenta activa",
        isActive: true,
        professionalRegistration: "No registrado",
        memberSince: "15 ene 2024",
        personalInformation: [
            { label: "Nombres", value: "No registrado" },
            { label: "Apellidos", value: "No registrado" },
            { label: "Nombre completo", value: "Carlos Ramírez" },
            { label: "Tipo de documento", value: "No registrado" },
            { label: "Número de documento", value: "No registrado" },
            { label: "Registro profesional", value: "No registrado" },
            { label: "Especialidad", value: "Medicina General" },
            { label: "Correo electrónico", value: "carlos@example.co" },
            { label: "Teléfono principal", value: "+57 310 123 4567" },
            { label: "Género", value: "No registrado" },
            { label: "Fecha de nacimiento", value: "No registrado" },
        ],
        address: [
            { label: "Dirección", value: "No registrado" },
            { label: "Ciudad", value: "No registrado" },
            { label: "Departamento", value: "No registrado" },
        ],
        contact: [
            {
                label: "Correo electrónico",
                value: "carlos@example.co",
                verificationStatus: "Verificado",
            },
            {
                label: "Teléfono principal",
                value: "+57 310 123 4567",
                verificationStatus: "No registrado",
            },
            {
                label: "Teléfono alternativo",
                value: "No registrado",
                verificationStatus: "No registrado",
            },
        ],
    },
});

const browser = await chromium.launch({ headless: true });

try {
    await mkdir("test-results", { recursive: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.setContent(html);
    for (const content of stylesheets) await page.addStyleTag({ content });

    assert.equal(await page.getByRole("heading", { name: "Mi perfil" }).count(), 1);
    assert.equal(await page.getByRole("heading", { name: "Datos personales" }).count(), 1);
    assert.equal(await page.getByRole("heading", { name: "Dirección" }).count(), 1);
    assert.equal(await page.getByRole("heading", { name: "Información de contacto" }).count(), 1);
    assert.equal(await page.getByRole("button", { name: /Editar perfil/ }).count(), 0);
    assert.equal(await page.locator(".doctor-profile-section-nav a").count(), 1);
    assert.equal(
        await page.locator(".doctor-profile-fields dd").first().textContent(),
        "No registrado",
    );

    for (const viewport of [
        { width: 390, height: 844 },
        { width: 768, height: 1024 },
        { width: 1366, height: 768 },
        { width: 1920, height: 1080 },
    ]) {
        await page.setViewportSize(viewport);
        const dimensions = await page.evaluate(() => ({
            viewport: document.documentElement.clientWidth,
            document: document.documentElement.scrollWidth,
        }));
        assert.ok(
            dimensions.document <= dimensions.viewport,
            `Horizontal overflow at ${viewport.width}px: ${JSON.stringify(dimensions)}`,
        );
    }

    const accessibility = await new AxeBuilder({ page }).include("[data-doctor-profile]").analyze();
    assert.deepEqual(accessibility.violations, []);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/doctor-profile-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.screenshot({ path: "test-results/doctor-profile-desktop.png", fullPage: true });
    console.log(
        "Doctor profile rendering passed at mobile, tablet, laptop, and desktop viewports.",
    );
} finally {
    await browser.close();
}
