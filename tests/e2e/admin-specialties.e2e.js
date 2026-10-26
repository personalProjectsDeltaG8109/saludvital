import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const specialtiesScript = await readFile(path.resolve("public/js/admin-specialties.js"), "utf8");
const dashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const specialtiesStyles = await readFile(path.resolve("public/css/admin-specialties.css"), "utf8");

const pageMarkup = `
    <body class="admin-app">
        <header class="admin-topbar">
            <button type="button" data-admin-open aria-expanded="false">Menú</button>
            <form class="admin-global-search"><input data-user-top-search></form>
        </header>
        <main class="specialties-page" data-admin-specialties data-endpoint="/api/admin/specialties">
            <header class="specialties-heading"><h1>Especialidades</h1><p>Catálogo médico</p></header>
            <section class="specialties-stats">
                <strong data-stat-total>—</strong><strong data-stat-active>—</strong>
                <strong data-stat-inactive>—</strong><strong data-stat-doctors>—</strong>
            </section>
            <section class="specialties-panel">
                <form class="specialties-filters" data-specialty-filters>
                    <label class="specialty-search-field"><span class="sr-only">Buscar</span><input data-specialty-search></label>
                    <label class="specialty-status-filter"><span>Estado</span><select data-specialty-status><option value="all">Todos</option><option value="active">Activas</option><option value="inactive">Inactivas</option></select></label>
                    <button class="specialty-search-button" type="submit">Buscar</button>
                </form>
                <p class="specialties-feedback" data-specialty-feedback></p>
                <div class="specialties-table-wrap"><table class="specialties-table"><thead><tr><th>#</th><th>Especialidad</th><th>Descripción</th><th>Médicos</th><th>Estado</th><th>Acciones</th></tr></thead><tbody data-specialty-list></tbody></table></div>
                <footer class="specialties-pagination"><span data-specialty-page-summary></span><div class="specialty-pagination-controls"><button type="button" aria-label="Página anterior" data-specialty-prev></button><span data-specialty-page-label></span><button type="button" aria-label="Página siguiente" data-specialty-next></button></div><label class="specialty-page-size"><select data-specialty-page-size><option value="10">10</option><option value="25">25</option></select></label></footer>
            </section>
            <p data-specialty-error hidden></p>
        </main>
    </body>`;

const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.setContent(pageMarkup);
    await page.addStyleTag({ content: dashboardStyles });
    await page.addStyleTag({ content: specialtiesStyles });
    await page.evaluate(() => {
        window.specialtyRequests = [];
        window.failSpecialtyRequest = false;
        window.fetch = async (url) => {
            const params = new URL(url, "http://localhost").searchParams;
            window.specialtyRequests.push({
                search: params.get("search"),
                status: params.get("status"),
                page: params.get("page"),
            });
            if (window.failSpecialtyRequest) {
                return {
                    ok: false,
                    json: async () => ({
                        message: "No pudimos cargar las especialidades. Inténtalo de nuevo.",
                    }),
                };
            }
            if (params.get("search") === "zz-no-results") {
                return {
                    ok: true,
                    json: async () => ({
                        specialties: [],
                        stats: { total: 3, active: 2, inactive: 1, assignedDoctors: 7 },
                        pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
                    }),
                };
            }
            const pageNumber = Number(params.get("page"));
            const isInactive = params.get("status") === "inactive";
            const record = isInactive
                ? {
                      id: 3,
                      name: "Neurología",
                      description: "Atención del sistema nervioso.",
                      isActive: false,
                      doctorCount: 2,
                  }
                : pageNumber === 2
                  ? {
                        id: 2,
                        name: "Pediatría",
                        description: "Atención infantil.",
                        isActive: true,
                        doctorCount: 5,
                    }
                  : {
                        id: 1,
                        name: "Medicina General",
                        description: "Atención integral.",
                        isActive: true,
                        doctorCount: 8,
                    };
            return {
                ok: true,
                json: async () => ({
                    specialties: [record],
                    stats: { total: 3, active: 2, inactive: 1, assignedDoctors: 15 },
                    pagination: { page: pageNumber, pageSize: 10, totalItems: 11, totalPages: 2 },
                }),
            };
        };
    });
    await page.addScriptTag({ content: specialtiesScript });
    await page.getByText("Medicina General").waitFor();

    for (const viewport of [
        { label: "mobile", width: 375, height: 812 },
        { label: "tablet", width: 768, height: 1024 },
        { label: "desktop", width: 1440, height: 900 },
    ]) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const layout = await page.evaluate(() => ({
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
        }));
        if (layout.documentWidth > layout.viewportWidth) {
            throw new Error(
                `Specialties page overflows at ${viewport.label}: ${JSON.stringify(layout)}`,
            );
        }
        console.log(
            `PASS: specialty layout has no horizontal overflow at ${viewport.label} (${viewport.width}x${viewport.height}).`,
        );
    }

    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByRole("link", { name: "Editar Medicina General" }).waitFor();
    await page.locator("[data-specialty-status]").selectOption("inactive");
    await page.getByText("Neurología").waitFor();
    await page.getByText("Inactiva", { exact: true }).waitFor();

    await page.locator("[data-specialty-status]").selectOption("all");
    await page.getByRole("button", { name: "Página siguiente" }).click();
    await page.getByText("Pediatría").waitFor();
    await page.locator("[data-specialty-search]").fill("zz-no-results");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByText("No encontramos especialidades con esos criterios.").waitFor();
    console.log("PASS: specialty status filter, pagination, and empty results.");

    await page.evaluate(() => {
        window.failSpecialtyRequest = true;
    });
    await page.locator("[data-specialty-search]").fill("");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByText("No pudimos cargar las especialidades. Inténtalo de nuevo.").waitFor();
    console.log("PASS: specialty API failure is announced with a safe message.");
} finally {
    await browser.close();
}
