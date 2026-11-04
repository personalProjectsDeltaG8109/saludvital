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
            <button class="admin-notification-button" type="button" aria-label="Ver notificaciones"></button>
        </header>
        <main class="specialties-page" data-admin-specialties data-endpoint="/api/admin/specialties">
            <header class="specialties-heading"><h1>Especialidades</h1><p>Catálogo médico</p></header>
            <section class="specialties-stats">
                <strong data-stat-total>—</strong><strong data-stat-active>—</strong>
                <strong data-stat-inactive>—</strong><strong data-stat-doctors>—</strong>
            </section>
            <section class="specialties-panel">
                <div class="specialties-filters" role="search" aria-label="Buscar y filtrar especialidades">
                    <label class="specialty-search-field"><span class="sr-only">Buscar</span><input data-specialty-search></label>
                    <label class="specialty-status-filter"><span>Estado</span><select data-specialty-status><option value="all">Todos</option><option value="active">Activas</option><option value="inactive">Inactivas</option></select></label>
                </div>
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
    if ((await page.locator(".admin-global-search").count()) !== 0)
        throw new Error("The administrator header must not render a duplicate global search.");
    if ((await page.locator("[data-specialty-search]").count()) !== 1)
        throw new Error("The specialties page must keep its local search field.");
    if ((await page.locator(".specialties-filters button").count()) !== 0)
        throw new Error("The specialty filters must not show a manual search button.");
    await page.addStyleTag({ content: dashboardStyles });
    await page.addStyleTag({ content: specialtiesStyles });
    await page.evaluate(() => {
        window.specialtyRequests = [];
        window.specialtyStatusRequests = [];
        window.specialtyIsActive = true;
        window.failSpecialtyRequest = false;
        window.delaySlowSpecialtySearch = false;
        window.fetch = async (url, options = {}) => {
            if (options.method === "PATCH") {
                const payload = JSON.parse(options.body);
                window.specialtyStatusRequests.push(payload.isActive);
                window.specialtyIsActive = payload.isActive;
                return {
                    ok: true,
                    json: async () => ({
                        specialty: { id: 1, name: "Medicina General", isActive: payload.isActive },
                    }),
                };
            }

            const params = new URL(url, "http://localhost").searchParams;
            window.specialtyRequests.push({
                search: params.get("search"),
                status: params.get("status"),
                page: params.get("page"),
                pageSize: params.get("pageSize"),
            });
            if (window.delaySlowSpecialtySearch && params.get("search") === "lenta") {
                await new Promise((resolve) => setTimeout(resolve, 400));
            }
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
            const record =
                params.get("search") === "lenta"
                    ? {
                          id: 8,
                          name: "Resultado anterior",
                          description: "Respuesta lenta.",
                          isActive: true,
                          doctorCount: 1,
                      }
                    : params.get("search") === "rápida"
                      ? {
                            id: 9,
                            name: "Resultado reciente",
                            description: "Respuesta reciente.",
                            isActive: true,
                            doctorCount: 1,
                        }
                      : isInactive
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
                                isActive: window.specialtyIsActive,
                                doctorCount: 5,
                            }
                          : {
                                id: 1,
                                name: "Medicina General",
                                description: "Atención integral.",
                                isActive: window.specialtyIsActive,
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
        { label: "small tablet", width: 768, height: 1024 },
        { label: "tablet", width: 900, height: 1024 },
        { label: "compact desktop", width: 1000, height: 900 },
        { label: "desktop breakpoint", width: 1001, height: 900 },
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
        const rowLayout = await page
            .locator(".specialties-table tbody tr:not(.specialties-empty-row)")
            .evaluate((row) => {
                const cells = [...row.querySelectorAll("td")].filter(
                    (cell) => getComputedStyle(cell).display !== "none",
                );
                const boxes = cells.map((cell) => {
                    const rect = cell.getBoundingClientRect();
                    return {
                        left: rect.left,
                        right: rect.right,
                        top: rect.top,
                        bottom: rect.bottom,
                    };
                });
                const actions = row.querySelector("td:nth-child(6)");
                const actionBounds = actions.getBoundingClientRect();
                const actionsFit = [...actions.querySelectorAll("a, button")].every((control) => {
                    const rect = control.getBoundingClientRect();
                    return rect.left >= actionBounds.left && rect.right <= actionBounds.right;
                });
                const cellsOverlap = boxes.some((first, index) =>
                    boxes
                        .slice(index + 1)
                        .some(
                            (second) =>
                                first.left < second.right &&
                                first.right > second.left &&
                                first.top < second.bottom &&
                                first.bottom > second.top,
                        ),
                );
                return { cellsOverlap, actionsFit };
            });
        if (rowLayout.cellsOverlap || !rowLayout.actionsFit) {
            throw new Error(
                `Specialty row content overlaps at ${viewport.label}: ${JSON.stringify(rowLayout)}`,
            );
        }
        if (viewport.width > 1000) {
            const numberToNameGap = await page
                .locator(".specialties-table tbody tr:not(.specialties-empty-row)")
                .evaluate((row) => {
                    const numberCell = row.querySelector("td:first-child");
                    const numberRange = document.createRange();
                    numberRange.selectNodeContents(numberCell);
                    const numberText = numberRange.getBoundingClientRect();
                    const icon = row.querySelector(".specialty-row-icon").getBoundingClientRect();
                    return icon.left - numberText.right;
                });
            if (numberToNameGap > 30) {
                throw new Error(
                    `The specialty number and name are too far apart: ${numberToNameGap}px.`,
                );
            }
        }
        await page.getByRole("button", { name: "Desactivar Medicina General" }).waitFor();
        console.log(
            `PASS: specialty layout has no horizontal overflow at ${viewport.label} (${viewport.width}x${viewport.height}).`,
        );
    }

    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("link", { name: "Editar Medicina General" }).waitFor();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Desactivar Medicina General" }).click();
    await page.getByText("Activa", { exact: true }).waitFor();
    if ((await page.evaluate(() => window.specialtyStatusRequests.length)) !== 0) {
        throw new Error("Cancelling the confirmation must not change specialty status.");
    }

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Desactivar Medicina General" }).click();
    await page.getByRole("button", { name: "Activar Medicina General" }).waitFor();
    await page.getByText("Inactiva", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Activar Medicina General" }).click();
    await page.getByRole("button", { name: "Desactivar Medicina General" }).waitFor();
    await page.getByText("Activa", { exact: true }).waitFor();
    if ((await page.evaluate(() => window.specialtyStatusRequests.join(","))) !== "false,true") {
        throw new Error("Deactivation and reactivation must send their expected statuses.");
    }
    console.log("PASS: explicit deactivation confirmation and specialty reactivation.");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("[data-specialty-status]").selectOption("inactive");
    await page.getByText("Neurología").waitFor();
    await page.getByText("Inactiva", { exact: true }).waitFor();

    await page.locator("[data-specialty-status]").selectOption("all");
    await page.getByRole("button", { name: "Página siguiente" }).click();
    await page.getByText("Pediatría").waitFor();
    await page.locator("[data-specialty-page-size]").selectOption("25");
    await page.waitForFunction(() =>
        [...window.specialtyRequests]
            .reverse()
            .some((request) => request.pageSize === "25" && request.page === "1"),
    );
    await page.locator("[data-specialty-search]").fill("medicina");
    await page.waitForFunction(() =>
        window.specialtyRequests.some((request) => request.search === "medicina"),
    );
    const liveSearchRequest = await page.evaluate(() =>
        [...window.specialtyRequests].reverse().find((request) => request.search === "medicina"),
    );
    if (
        liveSearchRequest.status !== "all" ||
        liveSearchRequest.page !== "1" ||
        liveSearchRequest.pageSize !== "25"
    ) {
        throw new Error("Live specialty search did not preserve filters or reset pagination.");
    }

    await page.evaluate(() => {
        window.delaySlowSpecialtySearch = true;
    });
    await page.locator("[data-specialty-search]").fill("lenta");
    await page.waitForFunction(() =>
        window.specialtyRequests.some((request) => request.search === "lenta"),
    );
    await page.locator("[data-specialty-search]").fill("rápida");
    await page.getByText("Resultado reciente").waitFor();
    await page.waitForTimeout(450);
    if (
        !(await page.getByText("Resultado reciente").isVisible()) ||
        (await page.getByText("Resultado anterior").count())
    ) {
        throw new Error("A stale specialty search response replaced newer results.");
    }
    console.log(
        "PASS: live specialty search preserves filters, resets pagination, and ignores stale responses.",
    );

    await page.locator("[data-specialty-search]").fill("zz-no-results");
    await page.getByText("No encontramos especialidades con esos criterios.").waitFor();
    console.log("PASS: specialty status filter, pagination, and empty results.");

    await page.evaluate(() => {
        window.failSpecialtyRequest = true;
    });
    await page.locator("[data-specialty-search]").fill("");
    await page.getByText("No pudimos cargar las especialidades. Inténtalo de nuevo.").waitFor();
    console.log("PASS: specialty API failure is announced with a safe message.");
} finally {
    await browser.close();
}
