import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const script = await readFile(path.resolve("public/js/admin-doctor-schedules.js"), "utf8");
const styles = await readFile(path.resolve("public/css/admin-doctor-schedules.css"), "utf8");
const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>
      <main data-doctor-schedules data-endpoint="/api/admin/doctor-schedules" data-weekly-endpoint="/api/admin/doctor-schedules" data-exceptions-endpoint="/api/admin/doctor-schedule-exceptions">
        <form data-schedule-filters><input data-schedule-search><select data-schedule-doctor><option value="">Todos</option></select><select data-schedule-specialty><option value="">Todas</option></select><select data-schedule-status><option value="all">Todos</option></select><input type="date" data-schedule-week value="2026-10-26"><button type="button" data-week-previous></button><button type="button" data-week-next></button><button type="submit">Buscar</button></form>
        <strong data-stat-active-doctors></strong><strong data-stat-configured></strong><strong data-stat-exceptions></strong><strong data-stat-affected></strong>
        <p data-schedule-week-label></p><p data-schedule-feedback></p><p data-schedule-error hidden></p><p data-schedule-empty hidden></p><div data-schedule-doctor-list></div>
        <section data-weekly-view hidden><button type="button" data-weekly-clear>Todos</button><p data-weekly-doctor-name></p><p data-weekly-date-range></p><p data-weekly-feedback></p><p data-weekly-error hidden></p><div data-weekly-content hidden><div data-weekly-grid></div><p data-weekly-specialty></p><p data-weekly-duration></p><p data-weekly-working-days></p><p data-weekly-working-hours></p><p data-weekly-empty hidden></p><ul data-weekly-editable-blocks></ul></div></section>
        <button type="button" data-exceptions-open>Administrar excepciones</button><p data-schedule-exceptions-empty hidden></p><ul data-schedule-exceptions></ul>
      </main>
      <dialog data-exception-manager-dialog>
        <section data-exception-manager>
          <button type="button" data-exception-close>Cerrar</button><p data-exception-error tabindex="-1" hidden></p><p data-exception-feedback hidden></p>
          <div class="schedule-exception-toolbar"><select data-exception-status><option value="all">Todos</option><option value="active">Activas</option><option value="inactive">Inactivas</option></select><button type="button" data-exception-create>Nueva excepción</button></div>
          <p data-exception-loading hidden>Cargando excepciones...</p><p data-exception-empty hidden>No hay excepciones para mostrar.</p><ul data-exception-list></ul>
          <form data-exception-form hidden><input type="hidden" data-exception-id><select required data-exception-doctor><option value="">Seleccione</option></select><select required data-exception-type><option value="Unavailable">No disponible</option><option value="AdditionalAvailability">Disponibilidad adicional</option></select><input type="datetime-local" step="1800" required data-exception-start><input type="datetime-local" step="1800" required data-exception-end><input type="text" required data-exception-reason><button type="button" data-exception-back>Volver</button><button type="submit" data-exception-submit>Guardar excepción</button></form>
        </section>
        <section data-exception-impact hidden><h3>Citas confirmadas</h3><p>Las citas no se modificarán.</p><ul data-exception-impact-list></ul><button type="button" data-exception-impact-cancel>Volver</button><button type="button" data-exception-impact-confirm>Confirmar y continuar</button></section>
      </dialog>
    </body></html>`);
    await page.addStyleTag({ content: styles });
    await page.evaluate(() => {
        window.exceptions = [];
        window.impactAcknowledgements = [];
        window.appointmentChanges = 0;
        window.cancelledAppointments = 0;
        window.fetch = async (url, options = {}) => {
            const requestUrl = new URL(url, "http://localhost");
            if (requestUrl.pathname === "/api/admin/doctor-schedules") {
                return new Response(
                    JSON.stringify({
                        summary: {
                            activeDoctors: 1,
                            configuredSchedules: 1,
                            upcomingExceptions: 0,
                            affectedAppointments: 0,
                        },
                        doctors: [],
                        doctorOptions: [
                            {
                                id: 7,
                                name: "Dra. Ana Torres",
                                email: "ana@example.co",
                                isActive: true,
                            },
                        ],
                        specialtyOptions: [],
                        exceptions: [],
                        week: { start: "2026-10-26", end: "2026-11-01" },
                    }),
                    { headers: { "Content-Type": "application/json" } },
                );
            }

            const isListRequest = options.method === undefined || options.method === "GET";
            if (isListRequest) {
                const status = requestUrl.searchParams.get("status");
                const exceptions = window.exceptions.filter(
                    (exception) =>
                        status === "all" ||
                        (status === "active" ? exception.isActive : !exception.isActive),
                );
                return new Response(
                    JSON.stringify({ exceptions, doctors: [{ id: 7, name: "Dra. Ana Torres" }] }),
                    { headers: { "Content-Type": "application/json" } },
                );
            }

            const body = JSON.parse(options.body);
            const isStatusRequest = requestUrl.pathname.endsWith("/status");
            const exceptionId = isStatusRequest
                ? Number(requestUrl.pathname.split("/").at(-2))
                : null;
            const currentException = window.exceptions.find(
                (exception) => exception.id === exceptionId,
            );
            const autoCancel =
                isStatusRequest &&
                !body.isActive &&
                currentException?.type === "AdditionalAvailability";
            const attemptKey = `${options.method}:${requestUrl.pathname}:${JSON.stringify(body)}`;
            if (
                !autoCancel &&
                !body.confirmImpact &&
                !window.impactAcknowledgements.includes(attemptKey)
            ) {
                window.impactAcknowledgements.push(attemptKey);
                return new Response(
                    JSON.stringify({
                        requiresConfirmation: true,
                        affectedAppointments: [
                            {
                                id: 201,
                                startAtLocal: "2030-10-28T08:00",
                                endAtLocal: "2030-10-28T08:30",
                            },
                        ],
                    }),
                    { status: 409, headers: { "Content-Type": "application/json" } },
                );
            }

            if (isStatusRequest) {
                if (autoCancel) window.cancelledAppointments += 1;
                window.exceptions = window.exceptions.map((exception) =>
                    exception.id === exceptionId
                        ? { ...exception, isActive: body.isActive }
                        : exception,
                );
            } else if (options.method === "POST") {
                window.exceptions.push({
                    id: body.type === "AdditionalAvailability" ? 16 : 15,
                    doctorId: 7,
                    doctorName: "Dra. Ana Torres",
                    startAt: "2030-10-28T13:00:00.000Z",
                    endAt: "2030-10-28T17:00:00.000Z",
                    startAtLocal: body.startAt,
                    endAtLocal: body.endAt,
                    type: body.type,
                    reason: body.reason,
                    isActive: true,
                });
            } else {
                const exceptionId = Number(requestUrl.pathname.split("/").at(-1));
                window.exceptions = window.exceptions.map((exception) =>
                    exception.id === exceptionId
                        ? { ...exception, reason: body.reason }
                        : exception,
                );
            }
            return new Response(
                JSON.stringify({
                    message: isStatusRequest
                        ? "La excepción se actualizó correctamente."
                        : "La excepción se guardó correctamente.",
                    affectedAppointmentsReviewed: autoCancel ? 0 : 1,
                    cancelledAppointmentsCount: autoCancel ? 1 : 0,
                    cancellationDetails: autoCancel
                        ? "Se canceló 1 cita. Notificaciones encoladas: 1."
                        : null,
                }),
                { headers: { "Content-Type": "application/json" } },
            );
        };
    });
    await page.addScriptTag({ content: script });
    await page.locator("[data-schedule-week-label]").waitFor();
    await page.locator("[data-exceptions-open]").click();
    await page.locator("[data-exception-manager-dialog]").waitFor({ state: "visible" });
    await page
        .locator("[data-exception-empty]:visible, [data-exception-error]:visible")
        .first()
        .waitFor();
    assert.equal(
        await page.locator("[data-exception-error]").isVisible(),
        false,
        await page.locator("[data-exception-error]").textContent(),
    );
    assert.equal(await page.locator("[data-exception-empty]").isVisible(), true);
    await page.locator("[data-exception-create]").click();
    await page.locator("[data-exception-form]:visible").waitFor();
    await page.locator("[data-exception-doctor]").selectOption("7");
    await page.locator("[data-exception-type]").selectOption("Unavailable");
    await page.locator("[data-exception-start]").fill("2030-10-28T08:00");
    await page.locator("[data-exception-end]").fill("2030-10-28T12:00");
    await page.locator("[data-exception-reason]").fill("Permiso personal");
    await page.locator("[data-exception-submit]").click();
    await page.locator("[data-exception-impact]:visible").waitFor();
    assert.match(await page.locator("[data-exception-impact-list]").textContent(), /Cita #201/);
    assert.match(await page.locator("[data-exception-impact]").textContent(), /no se modificarán/);
    await page.locator("[data-exception-impact-confirm]").click();
    await page.locator("[data-exception-list]").getByText("Permiso personal").waitFor();
    assert.match(
        await page.locator("[data-exception-feedback]").textContent(),
        /quedaron sin cambios/,
    );

    await page.locator("[data-exception-list] [data-edit-exception]").click();
    assert.equal(await page.locator("[data-exception-reason]").inputValue(), "Permiso personal");
    await page.locator("[data-exception-reason]").fill("Vacaciones");
    await page.locator("[data-exception-submit]").click();
    await page.locator("[data-exception-impact]:visible").waitFor();
    await page.locator("[data-exception-impact-confirm]").click();
    await page.locator("[data-exception-list]").getByText("Vacaciones").waitFor();

    await page.locator("[data-exception-list] [data-toggle-exception]").click();
    await page.locator("[data-exception-impact]:visible").waitFor();
    await page.locator("[data-exception-impact-confirm]").click();
    await page.locator("[data-exception-status]").selectOption("inactive");
    await page.locator("[data-exception-list] [data-toggle-exception]").waitFor();
    await page.locator("[data-exception-list] [data-toggle-exception]").click();
    await page.locator("[data-exception-impact]:visible").waitFor();
    await page.locator("[data-exception-impact-confirm]").click();
    await page.locator("[data-exception-status]").selectOption("active");
    await page.locator("[data-exception-list] [data-toggle-exception]").waitFor();

    await page.locator("[data-exception-create]").click();
    await page.locator("[data-exception-form]:visible").waitFor();
    await page.locator("[data-exception-doctor]").selectOption("7");
    await page.locator("[data-exception-type]").selectOption("AdditionalAvailability");
    await page.locator("[data-exception-start]").fill("2030-11-01T07:00");
    await page.locator("[data-exception-end]").fill("2030-11-01T07:30");
    await page.locator("[data-exception-reason]").fill("Jornada adicional");
    await page.locator("[data-exception-submit]").click();
    await page.locator("[data-exception-impact]:visible").waitFor();
    await page.locator("[data-exception-impact-confirm]").click();
    await page.locator("[data-exception-list]").getByText("Jornada adicional").waitFor();
    await page.locator("[data-exception-list] [data-toggle-exception]").last().click();
    await page
        .locator("[data-exception-feedback]")
        .getByText("Notificaciones encoladas: 1.")
        .waitFor();

    const appointmentChanges = await page.evaluate(() => window.appointmentChanges);
    assert.equal(appointmentChanges, 0);
    assert.equal(await page.evaluate(() => window.cancelledAppointments), 1);
    for (const viewport of [
        { width: 375, height: 812 },
        { width: 768, height: 1024 },
        { width: 1440, height: 900 },
    ]) {
        await page.setViewportSize(viewport);
        const dimensions = await page.evaluate(() => ({
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
        }));
        assert.ok(dimensions.documentWidth <= dimensions.viewportWidth);
    }
    assert.deepEqual(pageErrors, []);
    console.log(
        "PASS: exception creation, editing, status changes, affected-appointment review, and responsive layouts.",
    );
} finally {
    await browser.close();
}
