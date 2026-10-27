import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const pageScript = await readFile(path.resolve("public/js/admin-audit.js"), "utf8");
const dashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const pageStyles = await readFile(path.resolve("public/css/admin-audit.css"), "utf8");

const markup = `
    <!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body class="admin-app"><aside class="admin-sidebar" data-admin-sidebar></aside>
        <div class="admin-main-shell"><header class="admin-topbar"></header>
            <main class="admin-audit-content" data-admin-audit data-endpoint="/api/admin/audit-logs">
                <header class="admin-audit-heading"><div class="admin-audit-heading-icon">✓</div><div><h1>Auditoría</h1><p>Consulta el registro de acciones realizadas en el sistema.</p></div></header>
                <section class="admin-audit-filter-panel"><details class="admin-audit-filters" open><summary>Filtros</summary><div class="admin-audit-filter-grid">
                    <label>Fecha desde<input type="date" data-audit-start></label><label>Fecha hasta<input type="date" data-audit-end></label>
                    <label>Acción<select data-audit-action><option value="">Todas</option></select></label><label>Módulo<select data-audit-module><option value="">Todos</option></select></label>
                </div></details></section>
                <p data-audit-loading role="status">Cargando registros...</p><p data-audit-error role="alert" hidden></p><p data-audit-empty hidden>No hay registros que coincidan con los filtros seleccionados.</p>
                <section data-audit-results hidden><div class="admin-audit-table-wrap"><table class="admin-audit-table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Módulo</th><th>Acción</th><th>Detalle</th></tr></thead><tbody data-audit-table-body></tbody></table></div><ul class="admin-audit-cards" data-audit-card-list></ul><footer class="admin-audit-footer"><p data-audit-count></p><nav data-audit-pagination aria-label="Paginación de auditoría" hidden></nav></footer></section>
                <dialog data-audit-detail-dialog aria-labelledby="audit-detail-title"><header><h2 id="audit-detail-title">Detalle del evento</h2><button type="button" data-audit-detail-close aria-label="Cerrar detalle">×</button></header><p data-audit-detail-loading role="status" hidden></p><p data-audit-detail-error role="alert" hidden></p><div data-audit-detail-content hidden><dl data-audit-detail-fields></dl><section data-audit-change-section hidden><div data-audit-change-groups></div></section></div></dialog>
            </main>
        </div>
    </body></html>`;

const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(5000);
    page.on("pageerror", (error) => console.error("BROWSER ERROR:", error.message));
    await page.setContent(markup);
    await page.addStyleTag({ content: dashboardStyles });
    await page.addStyleTag({ content: pageStyles });
    await page.evaluate(() => {
        window.auditRequests = [];
        window.auditMode = "success";
        window.fetch = async (url) => {
            const requestUrl = new URL(url, "http://localhost");
            window.auditRequests.push(requestUrl);
            if (requestUrl.pathname === "/api/admin/audit-logs/1") {
                return {
                    ok: true,
                    json: async () => ({
                        id: 1,
                        occurredAt: "2026-10-20T15:30:00.000Z",
                        actor: "Administrador: admin@saludvital.com",
                        module: "Usuarios y roles",
                        action: "Actualización de cuenta",
                        description: "Se actualizaron los permisos de una cuenta.",
                        targetType: "Usuarios y roles",
                        targetDescription: "Cuenta de usuario",
                        targetId: "21",
                        result: "Correcto",
                        changes: {
                            before: [{ label: "Estado activo", value: "Sí" }],
                            after: [{ label: "Estado activo", value: "No" }],
                            recorded: [],
                        },
                    }),
                };
            }
            if (window.auditMode === "error") {
                return {
                    ok: false,
                    json: async () => ({ message: "No pudimos cargar la auditoría." }),
                };
            }
            if (window.auditMode === "empty") {
                return {
                    ok: true,
                    json: async () => ({
                        records: [],
                        totalItems: 0,
                        filters: { actions: [], modules: [] },
                    }),
                };
            }
            return {
                ok: true,
                json: async () => ({
                    totalItems: 25,
                    pagination: {
                        page: Number(requestUrl.searchParams.get("page") || 1),
                        pageSize: 10,
                        totalItems: 25,
                        totalPages: 3,
                    },
                    filters: {
                        actions: [
                            { value: "AdminAppointmentCancelled", label: "Cancelación de cita" },
                        ],
                        modules: [{ value: "Appointment", label: "Citas médicas" }],
                    },
                    records: [
                        {
                            id: 1,
                            occurredAt: "2026-10-20T15:30:00.000Z",
                            actor: "Administrador: admin@saludvital.com",
                            module: "Citas médicas",
                            action: "Cancelación de cita",
                            description: "Texto <img src=x onerror=alert(1)> seguro",
                        },
                    ],
                }),
            };
        };
    });
    await page.addScriptTag({ content: pageScript });
    await page
        .locator(".admin-audit-table tbody")
        .getByText("Texto <img src=x onerror=alert(1)> seguro")
        .waitFor();
    if (await page.locator("img").count()) throw new Error("Audit text must not render as HTML.");

    await page.getByRole("button", { name: "Ver detalle del evento #1" }).click();
    await page.getByText("Se actualizaron los permisos de una cuenta.").waitFor();
    await page.getByText("Cuenta de usuario", { exact: true }).waitFor();
    if (
        (await page.locator("dialog").getByText("Administrador: admin@saludvital.com").count()) !==
        1
    ) {
        throw new Error("The event detail view must display the persisted responsible user.");
    }
    if (
        await page
            .locator("dialog")
            .getByText(/Usuarios y roles #21/)
            .count()
    ) {
        throw new Error("The event detail view must identify related records without numeric IDs.");
    }
    await page.locator("[data-audit-detail-close]").click();
    if (await page.getByRole("button", { name: "Buscar" }).count())
        throw new Error("Audit filters must not require a Search button.");

    await page.getByRole("button", { name: "2", exact: true }).click();
    await page.waitForFunction(() => window.auditRequests.at(-1).searchParams.get("page") === "2");

    await page.locator("[data-audit-action]").selectOption("AdminAppointmentCancelled");
    await page.waitForFunction(
        () =>
            window.auditRequests.length >= 3 &&
            window.auditRequests.at(-1).searchParams.get("page") === "1",
    );
    const filteredQuery = await page.evaluate(() =>
        Object.fromEntries(window.auditRequests.at(-1).searchParams),
    );
    if (filteredQuery.action !== "AdminAppointmentCancelled") {
        throw new Error("Changing the action must apply the filter immediately.");
    }

    await page.locator("[data-audit-module]").selectOption("Appointment");
    await page.waitForFunction(() => window.auditRequests.length >= 4);
    const moduleQuery = await page.evaluate(() =>
        Object.fromEntries(window.auditRequests.at(-1).searchParams),
    );
    if (moduleQuery.module !== "Appointment")
        throw new Error("Module changes must filter immediately.");
    await page.locator("[data-audit-start]").fill("2026-10-20");
    await page.locator("[data-audit-start]").dispatchEvent("change");
    await page.waitForFunction(() => window.auditRequests.length >= 5);
    const dateQuery = await page.evaluate(() =>
        Object.fromEntries(window.auditRequests.at(-1).searchParams),
    );
    if (dateQuery.startDate !== "2026-10-20")
        throw new Error("Date changes must filter immediately.");
    console.log(
        "PASS: audit records render safely and date/action/module filters apply immediately.",
    );

    await page.setViewportSize({ width: 375, height: 812 });
    for (const viewport of [
        { label: "mobile", width: 375, height: 812 },
        { label: "tablet", width: 768, height: 1024 },
        { label: "desktop", width: 1440, height: 900 },
    ]) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const dimensions = await page.evaluate(() => ({
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
        }));
        if (dimensions.documentWidth > dimensions.viewportWidth) {
            throw new Error(
                `Audit page overflows at ${viewport.label}: ${JSON.stringify(dimensions)}.`,
            );
        }
    }
    console.log("PASS: audit page has no horizontal overflow at mobile, tablet, or desktop sizes.");

    const emptyRequestCount = await page.evaluate(() => window.auditRequests.length + 1);
    await page.evaluate(() => {
        window.auditMode = "empty";
        document.querySelector("[data-audit-action]").dispatchEvent(new Event("change"));
    });
    await page.waitForFunction((count) => window.auditRequests.length >= count, emptyRequestCount);
    await page.locator("[data-audit-empty]").waitFor({ state: "visible" });
    const errorRequestCount = await page.evaluate(() => window.auditRequests.length + 1);
    await page.evaluate(() => {
        window.auditMode = "error";
        document.querySelector("[data-audit-action]").dispatchEvent(new Event("change"));
    });
    await page.waitForFunction((count) => window.auditRequests.length >= count, errorRequestCount);
    await page.locator("[data-audit-error]").waitFor({ state: "visible" });
    console.log("PASS: audit page displays empty and error states.");
} finally {
    await browser.close();
}
