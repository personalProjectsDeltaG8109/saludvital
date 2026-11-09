import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const browserScript = await readFile(path.resolve("public/js/patient-notifications.js"), "utf8");
const stylesheet = await readFile(path.resolve("public/css/patient-notifications.css"), "utf8");
const dashboardStylesheet = await readFile(
    path.resolve("public/css/patient-dashboard.css"),
    "utf8",
);
const appStylesheet = await readFile(path.resolve("public/css/app.css"), "utf8");
const browser = await chromium.launch({ headless: true, channel: "chrome" });

try {
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    const page = await context.newPage();
    page.on("pageerror", (error) => console.error(error));
    await page.setContent(`
        <!doctype html><html lang="es"><head><title>Historial de notificaciones</title></head>
        <body class="sv-dashboard notifications-page"><a class="sv-bell" href="#" aria-label="Notificaciones" data-notification-count-url="/api/patient/notifications/unread-count"><span class="sv-notification-count">24</span></a>
        <main class="notifications-content"><section data-notification-settings data-preferences="[]" hidden>
            <button aria-label="Guardar preferencias" data-notification-save></button><button aria-label="Cancelar cambios" data-notification-cancel></button>
            <button aria-label="Confirmar guardado" data-confirm-notification-save></button><button aria-label="Revisar cambios" data-cancel-notification-save></button>
            <p data-notification-save-status></p><button aria-label="Cerrar resultado" data-close-notification-result></button><span data-notification-result-icon></span>
            <h2 data-notification-result-title></h2><p data-notification-result-message></p>
            <dialog data-notification-confirm-dialog><p data-notification-confirm-summary></p></dialog>
            <dialog data-notification-result-dialog></dialog>
        </section>
        <section class="notifications-card notifications-history" aria-labelledby="history-heading"><div class="notifications-history-heading"><div class="notifications-section-heading"><h2 id="history-heading">Historial de notificaciones</h2><p>Consulta los cambios de tus citas y los avisos recibidos, agrupados por fecha.</p></div>
            <span class="notifications-history-count" data-history-count></span><button class="notifications-mark-all" data-mark-all-read>Marcar todas como leídas</button></div>
            <div class="notifications-history-table-wrap"><table class="notifications-history-table"><thead><tr><th>Hora</th><th>Actividad</th><th>Estado</th><th aria-label="Abrir detalle"></th></tr></thead><tbody>
            ${Array.from({ length: 24 }, (_, index) => {
                const appointment = index === 0;
                const date = new Date(Date.UTC(2026, 10, 9 - Math.floor(index / 3), 15));
                const dateIso = date.toISOString();
                const day = new Intl.DateTimeFormat("es-CO", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    timeZone: "America/Bogota",
                }).format(date);
                const time = date.toLocaleTimeString("es-CO", {
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: "America/Bogota",
                });
                return `<tr tabindex="0" aria-label="Abrir notificación: ${appointment ? "Cita creada y confirmada" : `Aviso de cita ${index + 1}`}, ${day}" data-history-row class="is-unread" ${appointment ? 'data-in-app-activity="true" data-appointment-history-id="28"' : `data-notification-id="${75 + index}"`} data-history-details="${appointment ? "Tu cita quedó confirmada." : `Tu cita ${index + 1} tiene una actualización.`}" data-history-channel="${appointment ? "En SaludVital" : "Correo electrónico"}" data-history-status="${appointment ? "Registrada" : "Enviado"}" data-history-date="${dateIso}" data-history-day="${day}"><td class="notifications-history-time"><time datetime="${dateIso}">${time}</time></td><td class="notifications-history-content"><span class="notifications-history-title"><span class="notifications-history-kind">${appointment ? "Cita creada y confirmada" : `Aviso de cita ${index + 1}`}</span><span class="notifications-unread-label">Nueva</span></span><span class="notifications-history-summary">Actualización de tu cita médica.</span></td><td><span class="notifications-delivery-status">${appointment ? "Registrada" : "Enviado"}</span></td><td class="notifications-history-open" aria-hidden="true">›</td></tr>`;
            }).join("")}
            </tbody><tfoot><tr><td colspan="4"><nav class="notifications-history-pagination" aria-label="Páginas del historial" data-history-pagination hidden><span role="status" aria-live="polite" data-history-page-summary></span><div class="notifications-history-page-controls"><button type="button" data-history-previous aria-label="Página anterior">‹</button><span data-history-page-number></span><button type="button" data-history-next aria-label="Página siguiente">›</button></div></nav></td></tr></tfoot></table></div>
            <p data-notification-read-status role="status" aria-live="polite"></p>
        </section></main>
        <dialog class="notifications-appointment-dialog" data-appointment-details-dialog aria-labelledby="appointment-details-title" aria-describedby="appointment-details-status">
            <button class="notifications-appointment-dialog-close" data-close-appointment-details aria-label="Cerrar detalle">×</button><div class="notifications-appointment-doctor"><img data-appointment-doctor-photo alt="" hidden><span class="notifications-doctor-placeholder" data-appointment-doctor-placeholder>SV</span><div><h2 data-appointment-details-title></h2><p data-appointment-doctor-name></p></div></div>
            <dl class="notifications-appointment-facts"><div><dt>Especialidad</dt><dd data-appointment-specialty></dd></div><div><dt>Fecha y hora de la cita</dt><dd data-appointment-schedule></dd></div><div><dt>Estado</dt><dd data-appointment-status></dd></div><div><dt>Actividad registrada</dt><dd data-appointment-occurred-at></dd></div><div><dt>Canal</dt><dd data-appointment-channel></dd></div><div><dt>Mensaje</dt><dd data-appointment-message></dd></div></dl>
            <p class="notifications-appointment-detail-status" data-appointment-details-status role="status" aria-live="polite"></p>
        </dialog></main></body></html>`);
    await page.evaluate(() => {
        window.fetch = async (url, options = {}) => {
            if (url.includes("appointment-activity")) {
                return new Response(
                    JSON.stringify({
                        success: true,
                        data: {
                            eventLabel: "Cita creada y confirmada",
                            doctor: { name: "Dra. Ejemplo", photoUrl: "/uploads/doctor.png" },
                            specialty: "Medicina general",
                            appointmentStartAt: "2026-11-12T15:00:00.000Z",
                            appointmentStatus: "Confirmada",
                            occurredAt: "2026-11-04T15:00:00.000Z",
                        },
                    }),
                    { headers: { "Content-Type": "application/json" } },
                );
            }
            if (options.method === "PATCH") {
                window.lastReadUrl = url;
                window.lastReadRequest = JSON.parse(options.body || "{}");
                if (url.endsWith("/read")) window.detailReadRequest = window.lastReadRequest;
                return new Response(JSON.stringify({ success: true, data: { unreadCount: 0 } }), {
                    headers: { "Content-Type": "application/json" },
                });
            }
            return new Response("{}", { headers: { "Content-Type": "application/json" } });
        };
    });
    await page.addStyleTag({ content: appStylesheet });
    await page.addStyleTag({ content: dashboardStylesheet });
    await page.addStyleTag({ content: stylesheet });
    await page.addScriptTag({ content: browserScript });

    if ((await page.locator("[data-history-day-heading]:visible").count()) !== 4) {
        throw new Error("The first page did not group notifications under their dates.");
    }
    await page.locator(".notifications-history").screenshot({
        path: path.resolve("..", "patient-notification-history-preview.png"),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".notifications-history").screenshot({
        path: path.resolve("..", "patient-notification-history-mobile-preview.png"),
    });
    for (const width of [390, 360, 320, 768, 1365]) {
        await page.setViewportSize({ width, height: 844 });
        const pageWidth = await page.evaluate(() => ({
            viewport: window.innerWidth,
            document: document.documentElement.scrollWidth,
        }));
        if (pageWidth.document > pageWidth.viewport) {
            throw new Error(
                `The activity history overflowed at ${width}px: ${JSON.stringify(pageWidth)}`,
            );
        }
    }
    if ((await page.locator("[data-history-row]:visible").count()) !== 10) {
        throw new Error("The first history page did not show exactly ten rows.");
    }
    await page.getByText("Mostrando 1–10 de 24").waitFor();
    if (await page.getByRole("button", { name: "Ver detalle" }).count()) {
        throw new Error("A separate detail button was still shown in the history list.");
    }
    await page.locator("[data-history-row]").nth(1).click();
    await page.getByText("Notificación recibida").waitFor();
    await page.locator("[data-appointment-details-dialog]").screenshot({
        path: path.resolve("..", "patient-notification-detail-preview.png"),
    });
    if ((await page.locator("[data-appointment-channel]").textContent()) !== "Correo electrónico") {
        throw new Error("The notification channel was missing from its detail dialog.");
    }
    await page.getByRole("button", { name: "Cerrar detalle" }).click();

    await page.locator("[data-history-row]").first().click();
    await page.getByText("Dra. Ejemplo").waitFor();
    if (
        (await page.locator("[data-appointment-doctor-photo]").getAttribute("src")) !==
        "/uploads/doctor.png"
    ) {
        throw new Error("The persisted doctor photo was not displayed safely.");
    }
    const detailReadRequest = await page.evaluate(() => window.detailReadRequest);
    if (
        detailReadRequest?.appointmentHistoryIds?.[0] !== 28 ||
        detailReadRequest.notificationIds.length
    ) {
        throw new Error("Opening appointment details did not mark only that event as read.");
    }
    const detailsAxe = await new AxeBuilder({ page }).analyze();
    if (detailsAxe.violations.length) throw new Error(JSON.stringify(detailsAxe.violations));
    await page.getByRole("button", { name: "Cerrar detalle" }).click();

    await page.getByRole("button", { name: "Página siguiente" }).click();
    await page.getByText("Mostrando 11–20 de 24").waitFor();
    if ((await page.locator("[data-history-row]:visible").count()) !== 10) {
        throw new Error("The second history page did not show ten rows.");
    }
    await page.getByRole("button", { name: "Página siguiente" }).click();
    await page.getByText("Mostrando 21–24 de 24").waitFor();
    if ((await page.locator("[data-history-row]:visible").count()) !== 4) {
        throw new Error("The last history page did not show the remaining four rows.");
    }
    if ((await page.locator("[data-history-day-heading]:visible").count()) !== 2) {
        throw new Error("The last page did not rebuild date groups for the remaining entries.");
    }
    await page.getByRole("button", { name: "Marcar todas como leídas" }).click();
    await page.getByText("Todas las notificaciones están marcadas como leídas.").waitFor();
    if (await page.locator("tr.is-unread").count()) {
        throw new Error("Unread rows remained after marking all entries as read.");
    }
    const readRequest = await page.evaluate(() => ({ url: window.lastReadUrl }));
    if (!readRequest.url.endsWith("/read-all")) {
        throw new Error("The mark-all control did not call the protected read-all endpoint.");
    }
    console.log(
        "Patient notification date groups, pagination, row details, read state, responsive widths, and accessibility checks passed.",
    );
} finally {
    await browser.close();
}
