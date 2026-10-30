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
const profileScript = await readFile("public/js/doctor-profile.js", "utf8");
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
            { label: "Nombres", value: "No registrado", isProtected: true },
            { label: "Apellidos", value: "No registrado", isProtected: true },
            { label: "Nombre completo", value: "Carlos Ramírez", isProtected: true },
            { label: "Tipo de documento", value: "No registrado", isProtected: true },
            { label: "Número de documento", value: "No registrado", isProtected: true },
            { label: "Registro profesional", value: "No registrado", isProtected: true },
            { label: "Especialidad", value: "Medicina General", isProtected: true },
            { label: "Correo electrónico", value: "carlos@example.co", isProtected: true },
            { label: "Teléfono principal", value: "+57 310 123 4567" },
            { label: "Género", value: "No registrado", isProtected: true },
            { label: "Fecha de nacimiento", value: "No registrado", isProtected: true },
        ],
        address: [
            {
                label: "Direcci?n",
                value: "No registrado",
                fieldName: "address",
                rawValue: "",
                isEditable: true,
            },
            {
                label: "Ciudad",
                value: "No registrado",
                fieldName: "city",
                rawValue: "",
                isEditable: true,
            },
            {
                label: "Departamento",
                value: "No registrado",
                fieldName: "department",
                rawValue: "",
                isEditable: true,
            },
        ],
        contact: [
            {
                label: "Correo electr\u00f3nico",
                value: "carlos@example.co",
                isProtected: true,
                verificationStatus: "Verificado",
            },
            {
                label: "Tel\u00e9fono principal",
                value: "+57 310 123 4567",
                fieldName: "phone",
                rawValue: "+573101234567",
                isEditable: true,
                verificationStatus: "No registrado",
            },
            {
                label: "Tel\u00e9fono alternativo",
                value: "No registrado",
                fieldName: "alternatePhone",
                rawValue: "",
                isEditable: true,
                verificationStatus: "No registrado",
            },
        ],
        editableFields: {
            phone: "+573101234567",
            alternatePhone: "",
            address: "",
            department: "",
            city: "",
        },
    },
});

const browser = await chromium.launch({ headless: true });

try {
    await mkdir("test-results", { recursive: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.setContent(html);
    for (const content of stylesheets) await page.addStyleTag({ content });
    await page.addScriptTag({ content: profileScript });

    assert.equal(await page.getByRole("heading", { name: "Mi perfil" }).count(), 1);
    assert.equal(await page.getByRole("heading", { name: "Datos personales" }).count(), 1);
    assert.equal(await page.getByRole("heading", { name: "Dirección" }).count(), 1);
    assert.equal(await page.getByRole("heading", { name: "Información de contacto" }).count(), 1);
    assert.equal(await page.getByRole("button", { name: /Editar perfil/ }).count(), 1);
    assert.equal(await page.locator(".doctor-profile-section-nav a").count(), 1);
    assert.equal(await page.getByText("Solo administrador").count(), 11);
    assert.equal(
        await page
            .getByText("Los campos marcados solo pueden ser modificados por un administrador.")
            .count(),
        1,
    );
    assert.ok(
        (await page.locator(".doctor-profile-fields dd").first().textContent()).startsWith(
            "No registrado",
        ),
    );

    await page.evaluate(() => {
        window.profileRequests = [];
        window.fetch = async (url, options = {}) => {
            window.profileRequests.push({ url, options });
            if (url === "/api/locations/departments")
                return new Response(JSON.stringify({ data: [{ code: "05", name: "ANTIOQUIA" }] }));
            if (url.endsWith("/municipalities"))
                return new Response(
                    JSON.stringify({ data: [{ code: "05002", name: "ABEJORRAL" }] }),
                );
            if (options.method === "PUT")
                return new Response(
                    JSON.stringify({
                        message: "Tus datos se actualizaron correctamente.",
                        profile: {
                            editableFields: {
                                phone: "+573112223344",
                                alternatePhone: "+573155667788",
                                address: "Carrera 10 # 20-30",
                                department: "05",
                                city: "05002",
                            },
                            personalInformation: [{ fieldName: "phone", value: "+573112223344" }],
                            address: [
                                { fieldName: "address", value: "Carrera 10 # 20-30" },
                                { fieldName: "department", value: "ANTIOQUIA" },
                                { fieldName: "city", value: "ABEJORRAL" },
                            ],
                            contact: [
                                { fieldName: "phone", value: "+573112223344" },
                                { fieldName: "alternatePhone", value: "+573155667788" },
                            ],
                        },
                    }),
                );
            return new Response(JSON.stringify({ message: "Error de prueba." }), { status: 500 });
        };
    });
    await page.getByRole("button", { name: /Editar perfil/ }).click();
    const addressInput = page.locator('[data-profile-input="address"]');
    await addressInput.fill("Texto temporal");
    await page.getByRole("button", { name: "Cancelar" }).click();
    assert.equal(await addressInput.inputValue(), "");
    await page.getByRole("button", { name: /Editar perfil/ }).click();
    await page.locator('[data-profile-input="phone"]').fill("+573112223344");
    await page.locator('[data-profile-input="alternatePhone"]').fill("+573155667788");
    await addressInput.fill("Carrera 10 # 20-30");
    await page.locator('[data-profile-location="department"]').selectOption("05");
    await page.locator('[data-profile-location="city"]').selectOption("05002");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await page.getByText("Tus datos se actualizaron correctamente.").waitFor();
    assert.equal(await page.locator("[data-profile-summary-phone]").textContent(), "+573112223344");
    assert.equal(
        await page.locator('[data-profile-value="address"]').textContent(),
        "Carrera 10 # 20-30",
    );
    assert.equal(
        await page.evaluate(() =>
            window.profileRequests.some(
                ({ url, options }) => url === "/api/doctor/profile" && options.method === "PUT",
            ),
        ),
        true,
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
