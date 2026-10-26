import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const appointmentsScript = await readFile(path.resolve("public/js/admin-appointments.js"), "utf8");
const dashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const appointmentsStyles = await readFile(
    path.resolve("public/css/admin-appointments.css"),
    "utf8",
);

const pageMarkup = [
    '<!doctype html><html lang="es"><body class="admin-app">',
    '<header class="admin-topbar"><form class="admin-global-search"><input data-user-top-search></form></header>',
    '<main class="admin-appointments-page" data-admin-appointments data-endpoint="/api/admin/appointments">',
    '<header class="appointments-heading"><h1>Citas médicas</h1></header>',
    '<section class="appointment-stats"><strong data-stat-total></strong><strong data-stat-confirmed></strong><strong data-stat-in-progress></strong><strong data-stat-attended></strong><strong data-stat-cancelled></strong></section>',
    '<section class="appointments-panel"><form data-appointment-filters>',
    '<label>Fecha inicial<input type="date" data-appointment-from></label>',
    '<label>Fecha final<input type="date" data-appointment-to></label>',
    '<label>Estado<select data-appointment-status><option value="all">Todos</option></select></label>',
    '<label>Especialidad<select data-appointment-specialty><option value="all">Todas</option></select></label>',
    '<label>Médico<select data-appointment-doctor><option value="all">Todos</option></select></label>',
    '<label>Buscar paciente<input type="search" data-appointment-search></label>',
    '<button type="submit">Buscar</button></form>',
    '<nav data-appointment-tabs aria-label="Filtrar citas por estado"></nav>',
    "<p data-appointment-feedback></p><p data-appointment-error hidden></p>",
    '<div class="appointments-table-wrap"><table class="appointments-table"><thead><tr><th>Fecha y hora</th><th>Paciente</th><th>Documento</th><th>Especialidad</th><th>Médico</th><th>Estado</th></tr></thead><tbody data-appointment-list></tbody></table></div>',
    "<div data-appointment-mobile-list></div>",
    '<footer class="appointments-pagination"><span data-appointment-page-summary></span><div class="appointment-pagination-controls"><button data-appointment-prev></button><span data-appointment-page-label></span><button data-appointment-next></button></div><select data-appointment-page-size><option value="10">10</option><option value="25">25</option></select></footer>',
    '<dialog data-cancellation-dialog><form data-cancellation-form><p data-cancellation-description></p><textarea data-cancellation-reason></textarea><p data-cancellation-error hidden></p><button type="button" data-cancellation-close>Volver</button><button type="submit">Confirmar cancelación</button></form></dialog>',
    "</section></main></body></html>",
].join("");

const statuses = [
    { value: "Confirmed", label: "Confirmadas" },
    { value: "In Progress", label: "En curso" },
    { value: "Attended", label: "Asistidas" },
    { value: "Cancelled", label: "Canceladas" },
];

const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.setContent(pageMarkup);
    await page.addStyleTag({ content: dashboardStyles });
    await page.addStyleTag({ content: appointmentsStyles });
    await page.evaluate((availableStatuses) => {
        window.appointmentRequests = [];
        window.failAppointmentRequest = false;
        window.cancellationRequests = [];
        window.fetch = async (url, options = {}) => {
            if (options.method === "PATCH") {
                window.cancellationRequests.push({ url, body: JSON.parse(options.body) });
                return {
                    ok: true,
                    json: async () => ({ message: "La cita se canceló correctamente." }),
                };
            }
            const params = new URL(url, "http://localhost").searchParams;
            window.appointmentRequests.push(Object.fromEntries(params.entries()));
            if (window.failAppointmentRequest) {
                return {
                    ok: false,
                    json: async () => ({
                        message: "No pudimos cargar las citas. Inténtalo de nuevo.",
                    }),
                };
            }
            if (params.get("search") === "no-results" || params.get("status") === "In Progress") {
                return {
                    ok: true,
                    json: async () => ({
                        appointments: [],
                        statuses: availableStatuses,
                        specialties: [],
                        doctors: [],
                        stats: {
                            total: 1,
                            Confirmed: 1,
                            "In Progress": 0,
                            Attended: 0,
                            Cancelled: 0,
                        },
                        pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
                    }),
                };
            }
            return {
                ok: true,
                json: async () => ({
                    appointments: [
                        {
                            id: 10,
                            startAt: "2026-10-26T15:30:00.000Z",
                            endAt: "2026-10-26T16:00:00.000Z",
                            patient: {
                                id: 5,
                                name: "María Fernanda López",
                                document: "CC 123456",
                                photoUrl: null,
                            },
                            specialty: "Medicina General",
                            doctor: "Dra. Ana Torres",
                            status: "Confirmed",
                            statusLabel: "Confirmada",
                        },
                    ],
                    statuses: availableStatuses,
                    specialties: [{ id: 2, name: "Medicina General" }],
                    doctors: [{ id: 3, name: "Dra. Ana Torres" }],
                    stats: { total: 1, Confirmed: 1, "In Progress": 0, Attended: 0, Cancelled: 0 },
                    pagination: {
                        page: Number(params.get("page")),
                        pageSize: 10,
                        totalItems: 1,
                        totalPages: 1,
                    },
                }),
            };
        };
    }, statuses);
    await page.addScriptTag({ content: appointmentsScript });
    await page.getByText("María Fernanda López").first().waitFor();
    await page
        .getByRole("link", { name: "Ver detalles de la cita de María Fernanda López" })
        .first()
        .waitFor();
    await page
        .getByRole("link", { name: "Editar y reprogramar la cita de María Fernanda López" })
        .first()
        .waitFor();

    await page.locator('[data-cancel-appointment="10"]').first().click();
    await page.getByRole("dialog").waitFor({ state: "visible" });
    await page.locator("[data-cancellation-reason]").fill("El paciente solicita cancelar");
    await page.locator("[data-cancellation-form] button[type=submit]").click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    const cancellationRequest = await page.evaluate(() => window.cancellationRequests[0]);
    if (
        cancellationRequest.url !== "/api/admin/appointments/10/status" ||
        cancellationRequest.body.reason !== "El paciente solicita cancelar"
    ) {
        throw new Error(
            "Appointment cancellation did not submit the selected appointment and reason.",
        );
    }
    console.log(
        "PASS: cancellation requires a dialog confirmation and submits the optional reason.",
    );

    for (const viewport of [
        { label: "mobile", width: 375, height: 812 },
        { label: "small tablet", width: 760, height: 1024 },
        { label: "tablet", width: 768, height: 1024 },
        { label: "large tablet", width: 900, height: 1024 },
        { label: "compact desktop", width: 1000, height: 900 },
        { label: "desktop breakpoint", width: 1001, height: 900 },
        { label: "desktop", width: 1440, height: 900 },
    ]) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const layout = await page.evaluate(() => ({
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
            interfaceText: document.querySelector("[data-admin-appointments]").innerText,
            mobileListDisplay: getComputedStyle(
                document.querySelector("[data-appointment-mobile-list]"),
            ).display,
            actionsBelowStatus: (() => {
                const card = document.querySelector(".appointment-mobile-card");
                if (!card) return true;
                const status = card
                    .querySelector(".appointment-status-badge")
                    .getBoundingClientRect();
                const actions = card
                    .querySelector(".appointment-mobile-actions")
                    .getBoundingClientRect();
                return actions.top >= status.bottom;
            })(),
        }));
        if (layout.documentWidth > layout.viewportWidth) {
            throw new Error(
                "Appointment page overflows at " + viewport.label + ": " + JSON.stringify(layout),
            );
        }
        if (/pendiente/i.test(layout.interfaceText)) {
            throw new Error("The appointments page must only show the supported status labels.");
        }
        if (viewport.width <= 1000 && layout.mobileListDisplay === "none") {
            throw new Error("Appointment cards must replace the table below 1001px.");
        }
        if (viewport.width <= 1000 && !layout.actionsBelowStatus) {
            throw new Error("Appointment actions must stay below the status on compact layouts.");
        }
        console.log(
            "PASS: appointment layout and supported statuses at " +
                viewport.label +
                " (" +
                viewport.width +
                "x" +
                viewport.height +
                ").",
        );
    }

    await page.locator("[data-appointment-from]").fill("2026-10-20");
    await page.locator("[data-appointment-to]").fill("2026-10-27");
    await page.locator("[data-appointment-specialty]").selectOption("2");
    await page.locator("[data-appointment-doctor]").selectOption("3");
    await page.locator("[data-appointment-search]").fill("María");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByText("María Fernanda López").first().waitFor();
    const lastRequest = await page.evaluate(() => window.appointmentRequests.at(-1));
    if (
        lastRequest.from !== "2026-10-20" ||
        lastRequest.to !== "2026-10-27" ||
        lastRequest.specialtyId !== "2" ||
        lastRequest.doctorId !== "3" ||
        lastRequest.search !== "María" ||
        lastRequest.page !== "1"
    ) {
        throw new Error(
            "Appointment filters were not sent correctly: " + JSON.stringify(lastRequest),
        );
    }

    await page.locator("[data-status-tab='In Progress']").click();
    await page.getByText("No encontramos citas con esos criterios.").first().waitFor();
    if ((await page.evaluate(() => window.appointmentRequests.at(-1).status)) !== "In Progress") {
        throw new Error("Selecting an appointment status must filter the directory.");
    }
    console.log(
        "PASS: appointment search, date and directory filters, status tabs, and empty state.",
    );
    await page.evaluate(() => {
        window.failAppointmentRequest = true;
    });
    await page.locator("[data-appointment-search]").fill("");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByText("No pudimos cargar las citas. Inténtalo de nuevo.").waitFor();
    if (await page.getByText("No encontramos citas con esos criterios.").count()) {
        throw new Error("A failed request must not look like a successful empty result.");
    }
    console.log("PASS: appointment request errors have a clear error state.");
    console.log("PASS: appointment interface only exposes summary fields and supported statuses.");

    const resilientPage = await browser.newPage();
    await resilientPage.setContent(
        pageMarkup.replace(/<dialog data-cancellation-dialog>[\s\S]*?<\/dialog>/, ""),
    );
    await resilientPage.evaluate((availableStatuses) => {
        window.fetch = async () => ({
            ok: true,
            json: async () => ({
                appointments: [],
                statuses: availableStatuses,
                specialties: [],
                doctors: [],
                stats: { total: 0, Confirmed: 0, "In Progress": 0, Attended: 0, Cancelled: 0 },
                pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
            }),
        });
    }, statuses);
    await resilientPage.addScriptTag({ content: appointmentsScript });
    await resilientPage.waitForFunction(
        () =>
            document.querySelector("[data-appointment-feedback]")?.textContent ===
            "No hay citas para mostrar.",
    );
    console.log("PASS: the appointment list loads even when its optional dialog is unavailable.");
} finally {
    await browser.close();
}
