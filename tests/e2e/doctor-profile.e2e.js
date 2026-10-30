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
const profilePhotoScript = await readFile("public/js/doctor-profile-photo.js", "utf8");
const sidebarScript = await readFile("public/js/patient-sidebar.js", "utf8");
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
            },
            {
                label: "Tel\u00e9fono alternativo",
                value: "No registrado",
                fieldName: "alternatePhone",
                rawValue: "",
                isEditable: true,
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
    await page.route("**/uploads/profile-photos/doctor-new.png", (route) =>
        route.fulfill({
            status: 200,
            contentType: "image/png",
            body: Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jThsAAAAASUVORK5CYII=",
                "base64",
            ),
        }),
    );
    await page.setContent(html);
    for (const content of stylesheets) await page.addStyleTag({ content });
    await page.addScriptTag({ content: profileScript });
    await page.addScriptTag({ content: profilePhotoScript });
    await page.addScriptTag({ content: sidebarScript });

    const sidebarState = await page.evaluate(() => {
        document.querySelector(".sv-sidebar")?.classList.remove("is-open");
        document.querySelector("[data-close-sidebar]")?.classList.remove("is-visible");
        document.body.classList.remove("sidebar-menu-open");
        const sidebar = document.querySelector(".sv-sidebar");
        const backdrop = document.querySelector("[data-close-sidebar]");
        return {
            viewport: innerWidth,
            mobile: matchMedia("(max-width: 760px)").matches,
            sidebarClass: sidebar?.className,
            sidebarVisibility: getComputedStyle(sidebar).visibility,
            sidebarTransform: getComputedStyle(sidebar).transform,
            backdropClass: backdrop?.className,
        };
    });
    assert.equal(sidebarState.mobile, true);
    await page.addStyleTag({
        content: ".sv-sidebar { transform: translateX(-105%); visibility: hidden; }",
    });
    await page.screenshot({ path: "test-results/doctor-profile-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.screenshot({ path: "test-results/doctor-profile-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });

    assert.equal(await page.getByRole("heading", { name: "Mi perfil" }).count(), 1);
    assert.equal(await page.getByRole("heading", { name: "Datos personales" }).count(), 1);
    assert.equal(await page.getByRole("heading", { name: "Dirección" }).count(), 1);
    assert.equal(await page.getByRole("heading", { name: "Información de contacto" }).count(), 1);
    assert.equal(await page.getByRole("button", { name: /Editar perfil/ }).count(), 1);
    assert.equal(await page.locator(".doctor-profile-section-nav a").count(), 1);
    assert.equal(await page.getByText("Solo administrador").count(), 11);
    assert.equal(await page.getByText("No verificado").count(), 0);
    assert.equal(await page.getByText("Verificado").count(), 1);
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
        window.photoUploadAttempts = 0;
        window.fetch = async (url, options = {}) => {
            window.profileRequests.push({ url, options });
            if (url === "/api/doctor/profile/photo") {
                window.photoUploadAttempts += 1;
                if (window.photoUploadAttempts === 1) {
                    return new Response(JSON.stringify({ message: "Error al guardar." }), {
                        status: 500,
                    });
                }
                return new Response(
                    JSON.stringify({
                        profilePhotoUrl: "/uploads/profile-photos/doctor-new.png",
                        message: "Tu foto de perfil se actualizó correctamente.",
                    }),
                );
            }
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

    await page.getByRole("button", { name: "Cambiar foto de perfil" }).click();
    await page.locator("[data-profile-photo-input]").setInputFiles({
        name: "unsafe.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from("<svg></svg>"),
    });
    await page.getByText("Selecciona una foto JPG, PNG o WebP.").waitFor();
    assert.equal(
        await page.evaluate(() =>
            window.profileRequests.some(({ url }) => url === "/api/doctor/profile/photo"),
        ),
        false,
    );
    await page.locator("[data-profile-photo-input]").setInputFiles({
        name: "doctor.png",
        mimeType: "image/png",
        buffer: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jThsAAAAASUVORK5CYII=",
            "base64",
        ),
    });
    await page.locator("[data-photo-preview]").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Guardar foto" }).click();
    await page.getByText("La foto actual se conserva. Puedes volver a intentarlo.").waitFor();
    assert.equal(await page.locator("[data-profile-avatar] img").count(), 0);
    await page.getByRole("button", { name: "Guardar foto" }).click();
    await page.getByText("Tu foto de perfil se actualizó correctamente.").waitFor();
    assert.equal(
        await page.locator("[data-profile-avatar]").getAttribute("data-photo-url"),
        "/uploads/profile-photos/doctor-new.png",
    );
    assert.equal(
        await page.locator(".sv-user-chip .sv-avatar img.profile-avatar-image").getAttribute("src"),
        "/uploads/profile-photos/doctor-new.png",
    );

    for (const viewport of [
        { width: 320, height: 720 },
        { width: 390, height: 844 },
        { width: 430, height: 932 },
        { width: 760, height: 1024 },
        { width: 762, height: 1024 },
        { width: 768, height: 1024 },
        { width: 900, height: 1024 },
        { width: 1366, height: 768 },
        { width: 1920, height: 1080 },
    ]) {
        await page.setViewportSize(viewport);
        const dimensions = await page.evaluate(() => ({
            viewport: document.documentElement.clientWidth,
            document: document.documentElement.scrollWidth,
            personalCard: document
                .querySelector(".doctor-profile-grid > .doctor-profile-card")
                ?.getBoundingClientRect(),
            informationCards: document
                .querySelector(".doctor-profile-side")
                ?.getBoundingClientRect(),
            overflowingBadges: [
                ...document.querySelectorAll(
                    ".doctor-profile-fields dd .doctor-profile-readonly-badge",
                ),
            ].filter(
                (badge) =>
                    badge.getBoundingClientRect().right >
                    badge.parentElement.getBoundingClientRect().right + 1,
            ).length,
            bottomNavigation: (() => {
                const navigation = document.querySelector(".sv-bottom-nav");
                const links = [...(navigation?.querySelectorAll("a") || [])];
                return {
                    columns: getComputedStyle(navigation).gridTemplateColumns.split(" ").length,
                    widths: links.map((link) => link.getBoundingClientRect().width),
                    rightEdges: links.map((link) => link.getBoundingClientRect().right),
                };
            })(),
        }));
        assert.ok(
            dimensions.document <= dimensions.viewport,
            `Horizontal overflow at ${viewport.width}px: ${JSON.stringify(dimensions)}`,
        );
        if (viewport.width <= 760) {
            assert.equal(dimensions.bottomNavigation.columns, 5);
            assert.equal(dimensions.bottomNavigation.widths.length, 5);
            assert.ok(
                Math.max(...dimensions.bottomNavigation.widths) -
                    Math.min(...dimensions.bottomNavigation.widths) <
                    1,
                `Doctor navigation items should have equal widths at ${viewport.width}px`,
            );
            assert.ok(
                dimensions.bottomNavigation.rightEdges.every((edge) => edge <= viewport.width),
            );
        }
        if (viewport.width <= 900) {
            assert.ok(
                dimensions.informationCards.top >= dimensions.personalCard.bottom - 1,
                `Profile cards should stack at ${viewport.width}px: ${JSON.stringify(dimensions)}`,
            );
            assert.equal(
                dimensions.overflowingBadges,
                0,
                `Read-only badges should remain inside their fields at ${viewport.width}px`,
            );
        }
        if (viewport.width === 762) {
            await page.screenshot({ path: "test-results/doctor-profile-762.png", fullPage: true });
        }
    }

    const accessibility = await new AxeBuilder({ page }).include("[data-doctor-profile]").analyze();
    assert.deepEqual(accessibility.violations, []);
    console.log(
        "Doctor profile rendering passed at mobile, tablet, laptop, and desktop viewports.",
    );
} finally {
    await browser.close();
}
