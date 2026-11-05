import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const browserScript = await readFile(path.resolve("public/js/patient-notifications.js"), "utf8");
const browser = await chromium.launch({ headless: true });

try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on("pageerror", (error) => console.error(error));
    await page.setContent(`
        <!doctype html><html lang="es"><head><title>Historial de notificaciones</title></head>
        <body><a class="sv-bell" href="#" aria-label="Notificaciones" data-notification-count-url="/api/patient/notifications/unread-count"><span class="sv-notification-count">2</span></a>
        <main><h1>Historial de notificaciones</h1><section data-notification-settings data-preferences="[]">
            <button aria-label="Guardar preferencias" data-notification-save></button><button aria-label="Cancelar cambios" data-notification-cancel></button>
            <button aria-label="Confirmar guardado" data-confirm-notification-save></button><button aria-label="Revisar cambios" data-cancel-notification-save></button>
            <button aria-label="Cerrar resultado" data-close-notification-result></button><span data-notification-result-icon></span>
            <h2 data-notification-result-title></h2><p data-notification-result-message></p>
            <dialog data-notification-confirm-dialog><p data-notification-confirm-summary></p></dialog>
            <dialog data-notification-result-dialog></dialog>
        </section><button data-mark-all-read>Marcar todas como leídas</button>
        <button data-history-toggle aria-expanded="false">Ver todas</button>
        <table class="notifications-history-table"><tbody>
            <tr class="is-unread" data-in-app-activity="true" data-appointment-history-id="28"><td><span class="notifications-unread-label">Nueva</span></td><td><span class="notifications-history-kind">Cita creada y confirmada</span></td><td><button data-open-appointment-details>Ver detalle</button></td></tr>
            <tr class="is-unread" data-notification-id="75"><td><span class="notifications-unread-label">Nueva</span></td><td>Aviso de cita</td><td><button data-mark-notification-read>Marcar leída</button></td></tr>
        </tbody></table><p data-notification-read-status role="status" aria-live="polite"></p>
        <dialog data-appointment-details-dialog aria-labelledby="appointment-details-title" aria-describedby="appointment-details-status">
            <button data-close-appointment-details aria-label="Cerrar detalle">Cerrar</button>
            <img data-appointment-doctor-photo alt="" hidden><span data-appointment-doctor-placeholder>SV</span>
            <h2 data-appointment-details-title></h2><p data-appointment-doctor-name></p>
            <dl><dt>Especialidad</dt><dd data-appointment-specialty></dd><dt>Fecha y hora de la cita</dt><dd data-appointment-schedule></dd>
            <dt>Estado</dt><dd data-appointment-status></dd><dt>Actividad registrada</dt><dd data-appointment-occurred-at></dd></dl>
            <p data-appointment-details-status role="status" aria-live="polite"></p>
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
    await page.addScriptTag({ content: browserScript });
    await page.getByRole("button", { name: "Ver detalle" }).click();
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
    await page.getByRole("button", { name: "Marcar todas como leídas" }).click();
    await page.getByText("Todas las notificaciones están marcadas como leídas.").waitFor();
    const markedRows = await page.locator("tr.is-unread").count();
    if (markedRows) throw new Error("Unread rows remained after marking all entries as read.");
    const readRequest = await page.evaluate(() => ({
        url: window.lastReadUrl,
        body: window.lastReadRequest,
    }));
    if (!readRequest.url.endsWith("/read-all")) {
        throw new Error("The mark-all control did not call the protected read-all endpoint.");
    }
    console.log("Patient notification detail, read state, and accessibility checks passed.");
} finally {
    await browser.close();
}
