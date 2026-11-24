import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const pageScript = await readFile(path.resolve("public/js/admin-audit.js"), "utf8");
const dashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const pageStyles = await readFile(path.resolve("public/css/admin-audit.css"), "utf8");

const markup = `
    <!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body class="admin-app"><svg class="admin-module-icon-sprite" aria-hidden="true"><symbol id="admin-module-icon-appointment" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="16" rx="2"></rect><path d="M7.5 3v4M16.5 3v4M3.5 10h17M8 14h2M14 14h2"></path></symbol><symbol id="admin-module-icon-doctor" viewBox="0 0 24 24"><circle cx="12" cy="7" r="3"></circle><path d="M5 21v-2a7 7 0 0 1 14 0v2M19 8h3M20.5 6.5v3"></path></symbol><symbol id="admin-module-icon-schedule" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></symbol><symbol id="admin-module-icon-specialty" viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"></path></symbol><symbol id="admin-module-icon-user" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"></circle><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5.5a3 3 0 0 1 0 5.5M17 14a5 5 0 0 1 4 5v1"></path></symbol><symbol id="admin-module-icon-system" viewBox="0 0 24 24"><path d="M7 3h8l4 4v14H5V5a2 2 0 0 1 2-2ZM14 3v5h5M8 13h8M8 17h8"></path></symbol><symbol id="admin-module-icon-eye" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></symbol><symbol id="admin-module-icon-close" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"></path></symbol></svg><button type="button" class="admin-menu-toggle" data-admin-open aria-label="Abrir menú" aria-expanded="false" aria-controls="admin-sidebar">☰</button>
        <button type="button" class="admin-sidebar-backdrop" data-admin-close aria-label="Cerrar menú"></button>
        <aside id="admin-sidebar" class="admin-sidebar" data-admin-sidebar><button type="button" class="admin-sidebar-collapse" data-admin-close aria-label="Cerrar menú">×</button><a href="/admin/audit">Auditoría</a></aside>
        <div class="admin-main-shell"><header class="admin-topbar"></header>
            <main class="admin-audit-content" data-admin-audit data-endpoint="/api/admin/audit-logs">
                <header class="admin-audit-heading"><div class="admin-audit-heading-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 20 6v5c0 5.1-3.3 8.3-8 10-4.7-1.7-8-4.9-8-10V6l8-3Z"></path><path d="m9 12 2 2 4-4"></path></svg></div><div><h1>Auditoría</h1><p>Consulta el registro de acciones realizadas en el sistema.</p></div></header>
                <section class="admin-audit-filter-panel"><details class="admin-audit-filters" open><summary>Filtros</summary><div class="admin-audit-filter-grid">
                    <label>Fecha desde<input type="date" data-audit-start></label><label>Fecha hasta<input type="date" data-audit-end></label>
                    <label>Acción<select data-audit-action><option value="">Todas</option></select></label><label>Módulo<select data-audit-module><option value="">Todos</option></select></label>
                </div></details></section>
                <p data-audit-loading role="status">Cargando registros...</p><p data-audit-error role="alert" hidden></p><p data-audit-empty hidden>No hay registros que coincidan con los filtros seleccionados.</p>
                <section class="admin-audit-results" data-audit-results hidden><header class="admin-audit-results-heading"><div><h2>Actividad registrada</h2><p>Revisa las acciones recientes y abre un evento para conocer sus cambios.</p></div><p class="admin-audit-count" data-audit-count></p></header><div class="admin-audit-table-wrap"><table class="admin-audit-table"><thead><tr><th>Fecha</th><th>Usuario responsable</th><th>Módulo</th><th>Acción</th><th>Detalle</th><th>Evento</th></tr></thead><tbody data-audit-table-body></tbody></table></div><ul class="admin-audit-cards" data-audit-card-list></ul><footer class="admin-audit-footer"><nav data-audit-pagination aria-label="Paginación de auditoría" hidden></nav></footer></section>
                <dialog class="admin-audit-detail-dialog" data-audit-detail-dialog aria-labelledby="audit-detail-title"><header class="admin-audit-detail-header"><div><p class="admin-eyebrow">Control y seguimiento</p><h2 id="audit-detail-title">Detalle del evento</h2></div><button class="admin-audit-detail-close" type="button" data-audit-detail-close aria-label="Cerrar detalle"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#admin-module-icon-close"></use></svg></button></header><p class="admin-audit-detail-loading" data-audit-detail-loading role="status" hidden></p><p class="admin-audit-detail-error" data-audit-detail-error role="alert" hidden></p><div data-audit-detail-content hidden><section class="admin-audit-detail-summary"><span class="admin-audit-module-icon" data-audit-detail-icon></span><div class="admin-audit-detail-summary-copy"><div data-audit-detail-action></div><strong data-audit-detail-module></strong><p data-audit-detail-description></p></div></section><section class="admin-audit-event-section"><h3>Información del evento</h3><dl class="admin-audit-detail-fields" data-audit-detail-fields></dl></section><section class="admin-audit-change-section" data-audit-change-section hidden><h3>Cambios registrados</h3><div data-audit-change-groups></div></section></div></dialog>
            </main>
        </div>
    </body></html>`;

const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(5000);
    page.on("pageerror", (error) => console.error("BROWSER ERROR:", error.message));
    await page.route("http://localhost/**", (route) =>
        route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: markup }),
    );
    await page.goto("http://localhost/admin/audit?eventId=1");
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
                        moduleIcon: "user",
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
                            moduleIcon: "appointment",
                            action: "Cancelación de cita",
                            description: "Texto <img src=x onerror=alert(1)> seguro",
                        },
                        {
                            id: 2,
                            occurredAt: "2026-10-20T14:18:00.000Z",
                            actor: "Administrador Demo",
                            module: "Médicos",
                            moduleIcon: "doctor",
                            action: "Actualización de datos",
                            description: "Se actualizaron los datos de un médico.",
                        },
                        {
                            id: 3,
                            occurredAt: "2026-10-19T20:06:00.000Z",
                            actor: "Administrador Demo",
                            module: "Horarios",
                            moduleIcon: "schedule",
                            action: "Actualización de horario",
                            description: "Se ajustó el horario de atención.",
                        },
                        {
                            id: 4,
                            occurredAt: "2026-10-19T18:32:00.000Z",
                            actor: "Administrador Demo",
                            module: "Especialidades",
                            moduleIcon: "specialty",
                            action: "Creación de especialidad",
                            description: "Se registró una especialidad médica.",
                        },
                        {
                            id: 5,
                            occurredAt: "2026-10-19T16:45:00.000Z",
                            actor: "Administrador Demo",
                            module: "Usuarios y roles",
                            moduleIcon: "user",
                            action: "Actualización de cuenta",
                            description: "Se actualizó el perfil de un usuario.",
                        },
                    ],
                }),
            };
        };
    });
    await page.addScriptTag({ content: pageScript });
    await page.getByText("Se actualizaron los permisos de una cuenta.").waitFor();
    if (!(await page.locator("dialog").evaluate((dialog) => dialog.open))) {
        throw new Error("The requested audit event deep link must open its detail dialog.");
    }
    console.log("PASS: dashboard event links open the protected audit detail dialog.");
    await page.locator("[data-audit-detail-close]").click();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator("[data-admin-open]").click();
    if (
        !(await page
            .locator(".admin-app")
            .evaluate((element) => element.classList.contains("is-sidebar-open")))
    ) {
        throw new Error("The mobile audit menu button must open the sidebar.");
    }
    if ((await page.locator("[data-admin-open]").getAttribute("aria-expanded")) !== "true") {
        throw new Error("The mobile audit menu button must expose its expanded state.");
    }
    await page.waitForFunction(() => {
        const sidebar = document.querySelector("[data-admin-sidebar]");
        return Math.abs(new DOMMatrix(getComputedStyle(sidebar).transform).m41) <= 1;
    });
    const sidebarOffset = await page
        .locator("[data-admin-sidebar]")
        .evaluate((sidebar) => new DOMMatrix(getComputedStyle(sidebar).transform).m41);
    if (Math.abs(sidebarOffset) > 1) {
        throw new Error("The mobile audit sidebar must slide into view when opened.");
    }
    await page.locator(".admin-sidebar-collapse").click();
    if (
        await page
            .locator(".admin-app")
            .evaluate((element) => element.classList.contains("is-sidebar-open"))
    ) {
        throw new Error("The mobile audit close control must close the sidebar.");
    }
    await page.locator("[data-admin-open]").click();
    await page.locator(".admin-sidebar-backdrop").click({ position: { x: 360, y: 400 } });
    if (
        await page
            .locator(".admin-app")
            .evaluate((element) => element.classList.contains("is-sidebar-open"))
    ) {
        throw new Error("The mobile audit backdrop must close the sidebar.");
    }
    await page.locator("[data-admin-open]").click();
    await page.keyboard.press("Escape");
    if (
        await page
            .locator(".admin-app")
            .evaluate((element) => element.classList.contains("is-sidebar-open"))
    ) {
        throw new Error("Escape must close the mobile audit sidebar.");
    }
    console.log("PASS: mobile audit menu opens, closes, and responds to Escape.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page
        .locator(".admin-audit-table tbody")
        .getByText("Texto <img src=x onerror=alert(1)> seguro")
        .waitFor();
    if (await page.locator("img").count()) throw new Error("Audit text must not render as HTML.");
    await page
        .locator(
            '.admin-audit-table .admin-audit-module-icon use[href="#admin-module-icon-appointment"]',
        )
        .waitFor();
    for (const icon of ["doctor", "schedule", "specialty", "user"]) {
        await page
            .locator(
                `.admin-audit-table .admin-audit-module-icon use[href="#admin-module-icon-${icon}"]`,
            )
            .waitFor();
    }
    await page.locator(".admin-audit-results-heading").getByText("Actividad registrada").waitFor();

    await page.getByRole("button", { name: "Ver detalle del evento #1" }).click();
    await page.getByText("Se actualizaron los permisos de una cuenta.").waitFor();
    await page.locator(".admin-audit-detail-summary").getByText("Usuarios y roles").waitFor();
    const detailSectionHeading = page.locator(".admin-audit-event-section h3");
    await detailSectionHeading.waitFor();
    const detailHeadingText = await detailSectionHeading.textContent();
    if (!detailHeadingText.includes("Información del evento")) {
        throw new Error("The event detail must label its information section clearly.");
    }
    await page
        .locator(
            '.admin-audit-detail-summary .admin-audit-module-icon use[href="#admin-module-icon-user"]',
        )
        .waitFor();
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
        { label: "compact tablet 760", width: 760, height: 1024 },
        { label: "compact tablet 761", width: 761, height: 1024 },
        { label: "compact tablet 762", width: 762, height: 1024 },
        { label: "tablet", width: 768, height: 1024 },
        { label: "desktop 1280", width: 1280, height: 720 },
        { label: "desktop", width: 1440, height: 900 },
    ]) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const dimensions = await page.evaluate(() => ({
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
            cardDisplay: getComputedStyle(document.querySelector(".admin-audit-cards")).display,
            tableDisplay: getComputedStyle(document.querySelector(".admin-audit-table-wrap"))
                .display,
        }));
        if (dimensions.documentWidth > dimensions.viewportWidth) {
            throw new Error(
                `Audit page overflows at ${viewport.label}: ${JSON.stringify(dimensions)}.`,
            );
        }
        if (
            viewport.width <= 800 &&
            (dimensions.cardDisplay !== "grid" || dimensions.tableDisplay !== "none")
        ) {
            throw new Error(`Audit records must use readable cards at ${viewport.width}px.`);
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
