import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const adminDoctorsScript = await readFile(path.resolve("public/js/admin-doctors.js"), "utf8");
const adminDashboardScript = await readFile(path.resolve("public/js/admin-dashboard.js"), "utf8");
const appStyles = await readFile(path.resolve("public/css/app.css"), "utf8");
const adminDashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const adminDoctorsStyles = await readFile(path.resolve("public/css/admin-doctors.css"), "utf8");

async function preparePage(page, markup, initialActive = true) {
    await page.setContent(markup);
    await page.addStyleTag({
        content: "*,*::before,*::after{box-sizing:border-box}body{margin:0}",
    });
    await page.addStyleTag({ content: appStyles });
    await page.addStyleTag({ content: adminDashboardStyles });
    await page.addStyleTag({ content: adminDoctorsStyles });
    await page.evaluate((isActive) => {
        window.statusRequests = [];
        window.doctorIsActive = isActive;
        window.delaySlowDoctorSearch = false;
        window.fetch = async (url, options = {}) => {
            window.statusRequests.push({ url: String(url), method: options.method || "GET" });
            if (String(url).endsWith("/status-impact")) {
                return {
                    ok: true,
                    json: async () => ({
                        isActive: window.doctorIsActive,
                        upcomingAppointmentCount: 2,
                    }),
                };
            }
            if (options.method === "PATCH") {
                window.doctorIsActive = JSON.parse(options.body).isActive;
                return {
                    ok: true,
                    json: async () => ({
                        isActive: window.doctorIsActive,
                        cancelledAppointmentCount: window.doctorIsActive ? 0 : 2,
                        message: window.doctorIsActive
                            ? "La cuenta del médico se activó correctamente. Las citas canceladas no se restauraron."
                            : "La cuenta del médico se desactivó y se cancelaron 2 citas futuras.",
                    }),
                };
            }
            const requestUrl = new URL(String(url), "http://localhost");
            const searchTerm = requestUrl.searchParams.get("search") || "";
            if (window.delaySlowDoctorSearch && searchTerm === "lenta") {
                await new Promise((resolve) => setTimeout(resolve, 400));
            }
            return {
                ok: true,
                json: async () => ({
                    doctors: [
                        {
                            id: 12,
                            userId: 7,
                            name:
                                searchTerm === "lenta"
                                    ? "Resultado anterior"
                                    : searchTerm === "rápida"
                                      ? "Resultado reciente"
                                      : "Dra. Ana Torres",
                            email: "ana@example.com",
                            specialty: "Medicina General",
                            isActive: window.doctorIsActive,
                            profileReviewStatus: "approved",
                            hasSchedule: true,
                            profilePhotoUrl: null,
                        },
                    ],
                    specialties: [],
                    stats: {
                        total: 21,
                        active: window.doctorIsActive ? 16 : 15,
                        scheduled: 13,
                        inactive: window.doctorIsActive ? 5 : 6,
                    },
                    pagination: {
                        page: Number(requestUrl.searchParams.get("page")) || 1,
                        totalPages: 3,
                        totalItems: 21,
                    },
                }),
            };
        };
    }, initialActive);
    await page.addScriptTag({ content: adminDashboardScript });
    await page.addScriptTag({ content: adminDoctorsScript });
}

const listMarkup = `
    <body class="admin-app">
        <main class="doctors-page"
            data-doctors
            data-endpoint="/api/admin/doctors"
            data-status-impact-endpoint="/api/admin/doctors"
            data-status-endpoint="/api/admin/doctors">
            <header class="doctors-heading">
                <div class="doctors-heading-main">
                    <span class="doctor-stat-icon is-heading" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2v2M5 2v2"></path><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"></path><path d="M8 15a6 6 0 0 0 12 0v-3"></path><circle cx="20" cy="10" r="2"></circle></svg></span>
                    <div><p class="admin-eyebrow">Gestión médica</p><h1>Médicos</h1><p>Administra los profesionales médicos de SaludVital.</p></div>
                </div>
                <a class="doctors-primary-button" href="#">+ Crear médico</a>
            </header>
            <section class="doctors-stats" aria-label="Resumen de médicos">
                <article class="doctor-stat"><span class="doctor-stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="4"></circle><path d="M2 21v-2a7 7 0 0 1 12-4"></path><path d="M16 19h6m-3-3v6"></path></svg></span><div class="doctor-stat-content"><span>Total de médicos</span><strong data-stat-total></strong></div></article>
                <article class="doctor-stat is-active"><span class="doctor-stat-icon is-active" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="4"></circle><path d="M2 21v-2a7 7 0 0 1 12-4"></path><path d="m16 11 2 2 4-4"></path></svg></span><div class="doctor-stat-content"><span>Activos</span><strong data-stat-active></strong></div></article>
                <article class="doctor-stat is-scheduled"><span class="doctor-stat-icon is-scheduled" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path><path d="m9 15 2 2 4-4"></path></svg></span><div class="doctor-stat-content"><span>Con horario</span><strong data-stat-scheduled></strong></div></article>
                <article class="doctor-stat is-inactive"><span class="doctor-stat-icon is-inactive" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="4"></circle><path d="M2 21v-2a7 7 0 0 1 12-4"></path><path d="m16 16 5 5m0-5-5 5"></path></svg></span><div class="doctor-stat-content"><span>Inactivos</span><strong data-stat-inactive></strong></div></article>
            </section>
            <section class="doctors-panel">
                <div class="doctors-filters" role="search" aria-label="Buscar y filtrar médicos">
                    <label><input aria-label="Buscar médicos" placeholder="Buscar por nombre o correo electrónico..." data-doctor-search></label>
                    <label><select data-doctor-specialty><option value="">Todas las especialidades</option></select></label>
                    <label><select data-doctor-status><option value="">Todos los estados</option><option value="active">Activos</option></select></label>
                </div>
                <p class="doctors-feedback" data-doctor-feedback></p>
                <div class="doctors-list" data-doctor-list></div>
                <footer class="doctors-pagination">
                    <span data-doctor-page></span>
                    <div>
                        <button type="button" data-doctor-prev>Anterior</button>
                        <button type="button" data-doctor-next>Siguiente</button>
                    </div>
                </footer>
            </section>
        </main>
    </body>`;

const detailMarkup = `
    <body class="admin-app">
        <main class="doctor-details-page"
            data-doctor-details
            data-status-impact-endpoint="/api/admin/doctors"
            data-status-endpoint="/api/admin/doctors">
            <section class="doctor-details-hero">
                <div class="doctor-details-identity">
                    <h2 id="doctor-name">Dra. Ana Torres</h2>
                    <span class="doctor-status is-active" data-doctor-status-label>Activo</span>
                </div>
                <div class="doctor-details-actions">
                    <a class="doctors-secondary-button doctor-details-manage">Editar médico</a>
                    <button class="doctors-secondary-button doctor-status-action is-deactivation"
                        data-doctor-status-action data-doctor-id="12" data-is-active="true">
                        Desactivar médico
                    </button>
                </div>
            </section>
            <p data-doctor-status-feedback></p>
        </main>
    </body>`;

const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
});

try {
    const listPage = await browser.newPage({ viewport: { width: 320, height: 720 } });
    await preparePage(listPage, listMarkup);
    await listPage.getByText("Dra. Ana Torres").waitFor();

    const summaryIcons = await listPage
        .locator(".doctors-heading-main .doctor-stat-icon, .doctor-stat-icon")
        .count();
    if (summaryIcons !== 5 || (await listPage.locator(".doctor-stat-icon svg").count()) !== 5) {
        throw new Error("The doctors heading and summary cards must each show an SVG icon.");
    }

    if (process.env.ADMIN_DOCTORS_SCREENSHOT_DIR) {
        const screenshotDir = process.env.ADMIN_DOCTORS_SCREENSHOT_DIR;
        await mkdir(screenshotDir, { recursive: true });
        await listPage.setViewportSize({ width: 1440, height: 900 });
        await listPage.screenshot({
            path: path.join(screenshotDir, "admin-doctor-icons-desktop.png"),
            fullPage: true,
        });
        await listPage.setViewportSize({ width: 390, height: 844 });
        await listPage.screenshot({
            path: path.join(screenshotDir, "admin-doctor-icons-mobile.png"),
            fullPage: true,
        });
        await listPage.setViewportSize({ width: 320, height: 720 });
    }

    const listLayout = await listPage.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
    }));
    if (listLayout.documentWidth > listLayout.viewportWidth) {
        throw new Error(`Doctor list overflows on mobile: ${JSON.stringify(listLayout)}`);
    }

    const deactivateButton = listPage.getByRole("button", { name: "Desactivar a Dra. Ana Torres" });
    await deactivateButton.click();
    const confirmation = listPage.getByRole("dialog");
    await confirmation.getByText(/2 citas futuras confirmadas se cancelarán/).waitFor();
    await confirmation.getByRole("button", { name: "Volver" }).click();
    if (
        await listPage.evaluate(() => statusRequests.some((request) => request.method === "PATCH"))
    ) {
        throw new Error("Cancelling the confirmation changed the doctor's status.");
    }

    await listPage.getByRole("button", { name: "Desactivar a Dra. Ana Torres" }).click();
    await listPage.getByRole("dialog").getByRole("button", { name: "Desactivar médico" }).click();
    await listPage.getByText("Inactivo", { exact: true }).waitFor();
    await listPage.getByRole("button", { name: "Activar a Dra. Ana Torres" }).click();
    await listPage.getByRole("button", { name: "Desactivar a Dra. Ana Torres" }).waitFor();
    console.log("PASS: mobile doctor status confirmation, cancellation, and reactivation flow.");

    await listPage.locator("[data-doctor-next]").click();
    await listPage.getByText("Página 2 de 3").waitFor();
    if (
        await listPage
            .locator(".doctors-filters form, .doctors-filters button[type=submit]")
            .count()
    ) {
        throw new Error("A manual doctor search control is still present.");
    }
    await listPage.locator("[data-doctor-status]").selectOption("active");
    await listPage.locator("[data-doctor-search]").fill("ana");
    await listPage.waitForFunction(() =>
        window.statusRequests.some((request) =>
            new URL(request.url, "http://localhost").searchParams.has("search"),
        ),
    );
    const liveSearchRequest = await listPage.evaluate(() => {
        const request = [...window.statusRequests]
            .reverse()
            .find((item) => new URL(item.url, "http://localhost").searchParams.has("search"));
        return Object.fromEntries(new URL(request.url, "http://localhost").searchParams);
    });
    if (
        liveSearchRequest.search !== "ana" ||
        liveSearchRequest.status !== "active" ||
        liveSearchRequest.page !== "1"
    ) {
        throw new Error("Live search did not preserve filters or reset pagination.");
    }

    await listPage.evaluate(() => {
        window.delaySlowDoctorSearch = true;
    });
    await listPage.locator("[data-doctor-search]").fill("lenta");
    await listPage.waitForFunction(() =>
        window.statusRequests.some(
            (request) =>
                new URL(request.url, "http://localhost").searchParams.get("search") === "lenta",
        ),
    );
    await listPage.locator("[data-doctor-search]").fill("rápida");
    await listPage.getByText("Resultado reciente").waitFor();
    await listPage.waitForTimeout(450);
    if (
        !(await listPage.getByText("Resultado reciente").isVisible()) ||
        (await listPage.getByText("Resultado anterior").count())
    ) {
        throw new Error("A stale doctor search response replaced newer results.");
    }
    console.log("PASS: live doctor search preserves filters and ignores stale responses.");

    const detailsPage = await browser.newPage({ viewport: { width: 320, height: 720 } });
    await preparePage(detailsPage, detailMarkup);
    await detailsPage.getByRole("button", { name: "Desactivar médico" }).click();
    await detailsPage
        .getByRole("dialog")
        .getByRole("button", { name: "Desactivar médico" })
        .click();
    await detailsPage.getByText("Inactivo", { exact: true }).waitFor();
    const detailLayout = await detailsPage.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
    }));
    if (detailLayout.documentWidth > detailLayout.viewportWidth) {
        throw new Error(`Doctor details overflow on mobile: ${JSON.stringify(detailLayout)}`);
    }
    console.log("PASS: mobile doctor details status action and responsive confirmation.");
} finally {
    await browser.close();
}
