import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const adminDoctorsScript = await readFile(path.resolve("public/js/admin-doctors.js"), "utf8");
const adminDashboardScript = await readFile(path.resolve("public/js/admin-dashboard.js"), "utf8");
const adminDoctorsStyles = await readFile(path.resolve("public/css/admin-doctors.css"), "utf8");

async function preparePage(page, markup, initialActive = true) {
    await page.setContent(markup);
    await page.addStyleTag({
        content: "*,*::before,*::after{box-sizing:border-box}body{margin:0}",
    });
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
                            hasSchedule: true,
                            profilePhotoUrl: null,
                        },
                    ],
                    specialties: [],
                    stats: {
                        total: 1,
                        active: window.doctorIsActive ? 1 : 0,
                        scheduled: 1,
                        inactive: window.doctorIsActive ? 0 : 1,
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
    <body>
        <main class="doctors-page"
            data-doctors
            data-endpoint="/api/admin/doctors"
            data-status-impact-endpoint="/api/admin/doctors"
            data-status-endpoint="/api/admin/doctors">
            <header class="doctors-heading"><h1>Médicos</h1></header>
            <section class="doctors-stats">
                <article class="doctor-stat"><strong data-stat-total></strong></article>
                <article class="doctor-stat"><strong data-stat-active></strong></article>
                <article class="doctor-stat"><strong data-stat-scheduled></strong></article>
                <article class="doctor-stat"><strong data-stat-inactive></strong></article>
            </section>
            <section class="doctors-panel">
                <form class="doctors-filters" data-doctor-filters>
                    <label><input data-doctor-search></label>
                    <label><select data-doctor-specialty><option value="">Todas</option></select></label>
                    <label><select data-doctor-status><option value="">Todos</option><option value="active">Activos</option></select></label>
                    <button type="submit">Buscar</button>
                </form>
                <p class="doctors-feedback" data-doctor-feedback></p>
                <div class="doctors-list" data-doctor-list></div>
                <span data-doctor-page></span>
                <button type="button" data-doctor-prev></button>
                <button type="button" data-doctor-next></button>
            </section>
        </main>
    </body>`;

const detailMarkup = `
    <body>
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

const browser = await chromium.launch({ headless: true });

try {
    const listPage = await browser.newPage({ viewport: { width: 320, height: 720 } });
    await preparePage(listPage, listMarkup);
    await listPage.getByText("Dra. Ana Torres").waitFor();

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
    await listPage.getByText("Inactivo").waitFor();
    await listPage.getByRole("button", { name: "Activar a Dra. Ana Torres" }).click();
    await listPage.getByRole("button", { name: "Desactivar a Dra. Ana Torres" }).waitFor();
    console.log("PASS: mobile doctor status confirmation, cancellation, and reactivation flow.");

    await listPage.locator("[data-doctor-next]").click();
    await listPage.getByText("Página 2 de 3").waitFor();
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
    await detailsPage.getByText("Inactivo").waitFor();
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
