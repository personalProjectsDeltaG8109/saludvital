import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const pageScript = await readFile(path.resolve("public/js/admin-doctor-schedules.js"), "utf8");
const dashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const pageStyles = await readFile(path.resolve("public/css/admin-doctor-schedules.css"), "utf8");

const markup = `
    <body class="admin-app">
        <header class="admin-topbar"><form class="admin-global-search"><input data-user-top-search></form></header>
        <main class="doctor-schedules-page" data-doctor-schedules data-endpoint="/api/admin/doctor-schedules" data-weekly-endpoint="/api/admin/doctor-schedules">
            <header class="schedule-heading"><div class="schedule-heading-icon">◷</div><div><h1>Horarios y disponibilidad</h1><p>Gestiona los horarios médicos.</p></div></header>
            <section class="schedule-stats"><strong data-stat-active-doctors>—</strong><strong data-stat-configured>—</strong><strong data-stat-exceptions>—</strong><strong data-stat-affected>—</strong></section>
            <form class="schedule-filters" data-schedule-filters>
                <label class="schedule-search">Buscar médico<input type="search" data-schedule-search></label>
                <label>Médico<select data-schedule-doctor><option value="">Todos</option></select></label>
                <label>Especialidad<select data-schedule-specialty><option value="">Todas</option></select></label>
                <label>Estado<select data-schedule-status><option value="all">Todos</option><option value="configured">Con horario</option><option value="unconfigured">Sin horario</option></select></label>
                <label>Semana<div class="schedule-week-control"><button type="button" data-week-previous>‹</button><input type="date" data-schedule-week><button type="button" data-week-next>›</button></div></label>
                <button class="schedule-search-button" type="submit">Buscar</button>
            </form>
            <div class="schedule-content">
                <section class="schedule-panel"><h2>Horario semanal</h2><p data-schedule-week-label></p><p data-schedule-feedback></p><p data-schedule-error hidden></p>
                    <section data-weekly-view hidden><h3 data-weekly-doctor-name></h3><p data-weekly-date-range></p><button type="button" data-weekly-clear>Ver todos los médicos</button><p data-weekly-feedback hidden></p><p data-weekly-error hidden></p>
                        <div data-weekly-content hidden><div data-weekly-grid></div><dd data-weekly-specialty></dd><dd data-weekly-duration></dd><dd data-weekly-working-days></dd><dd data-weekly-working-hours></dd></div><p data-weekly-empty hidden></p>
                    </section>
                    <div data-schedule-doctor-list></div><p data-schedule-empty hidden>No hay médicos que coincidan con los filtros seleccionados.</p>
                </section>
                <aside class="schedule-panel"><h2>Próximas excepciones</h2><p data-schedule-exceptions-empty hidden>No hay excepciones próximas.</p><ul data-schedule-exceptions></ul></aside>
            </div>
        </main>
    </body>`;

const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(5000);
    page.on("pageerror", (error) => console.error("BROWSER ERROR:", error.message));
    await page.setContent(markup);
    await page.addStyleTag({ content: dashboardStyles });
    await page.addStyleTag({ content: pageStyles });
    await page.evaluate(() => {
        window.scheduleRequests = [];
        window.weeklyRequests = [];
        window.scheduleMode = "success";
        window.fetch = async (url) => {
            const requestUrl = new URL(url, "http://localhost");
            if (requestUrl.pathname.endsWith("/week")) {
                window.weeklyRequests.push({
                    doctorId: requestUrl.pathname.split("/").at(-2),
                    weekStart: requestUrl.searchParams.get("weekStart"),
                });
                if (window.scheduleMode === "error")
                    return {
                        ok: false,
                        json: async () => ({ message: "No pudimos cargar la semana del médico." }),
                    };
                const weeklyStart = requestUrl.searchParams.get("weekStart");
                const weeklyEnd = new Date(`${weeklyStart}T00:00:00Z`);
                weeklyEnd.setUTCDate(weeklyEnd.getUTCDate() + 6);
                return {
                    ok: true,
                    json: async () => ({
                        doctor: { id: 1, name: "Dra. Ana Torres", specialty: "Medicina General" },
                        week: { start: weeklyStart, end: weeklyEnd.toISOString().slice(0, 10) },
                        appointmentDurationMinutes: 30,
                        workingDays: [
                            {
                                date: "2026-10-26",
                                dayLabel: "Lunes",
                                intervals: [{ startTime: "08:00", endTime: "12:00" }],
                            },
                        ],
                        days: [
                            {
                                date: "2026-10-26",
                                dayLabel: "Lunes",
                                events: [
                                    {
                                        id: 1,
                                        type: "available",
                                        label: "Disponible",
                                        startTime: "08:00",
                                        endTime: "12:00",
                                    },
                                    {
                                        id: 12,
                                        type: "appointment",
                                        reference: "Cita #12",
                                        statusLabel: "Confirmada",
                                        startTime: "09:00",
                                        endTime: "09:30",
                                    },
                                ],
                            },
                            {
                                date: "2026-10-27",
                                dayLabel: "Martes",
                                events: [
                                    {
                                        id: 2,
                                        type: "available",
                                        label: "Disponible",
                                        startTime: "07:00",
                                        endTime: "12:00",
                                    },
                                    {
                                        id: 3,
                                        type: "blocked",
                                        label: "No disponible",
                                        reason: "Permiso",
                                        startTime: "00:00",
                                        endTime: "24:00",
                                    },
                                ],
                            },
                            ...["Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map(
                                (dayLabel, index) => ({
                                    date: new Date(Date.UTC(2026, 9, 28 + index))
                                        .toISOString()
                                        .slice(0, 10),
                                    dayLabel,
                                    events: [],
                                }),
                            ),
                        ],
                    }),
                };
            }
            const params = requestUrl.searchParams;
            window.scheduleRequests.push(Object.fromEntries(params));
            if (window.scheduleMode === "error") {
                return {
                    ok: false,
                    json: async () => ({ message: "No pudimos cargar los horarios." }),
                };
            }
            const payload = structuredClone(window.scheduleResponse);
            const selectedWeekStart = params.get("weekStart") || "2026-10-26";
            const selectedWeekEnd = new Date(`${selectedWeekStart}T00:00:00Z`);
            selectedWeekEnd.setUTCDate(selectedWeekEnd.getUTCDate() + 6);
            payload.week = {
                start: selectedWeekStart,
                end: selectedWeekEnd.toISOString().slice(0, 10),
            };
            if (params.get("search") === "sin-resultados") payload.doctors = [];
            if (params.get("doctorId") === "")
                payload.doctorOptions.push({
                    id: 2,
                    name: "Dr. Luis Morales",
                    email: "luis@example.co",
                });
            return { ok: true, json: async () => payload };
        };
        window.scheduleResponse = {
            summary: {
                activeDoctors: 18,
                configuredSchedules: 16,
                upcomingExceptions: 1,
                affectedAppointments: 2,
            },
            doctors: [
                {
                    id: 1,
                    name: "Dra. Ana Torres",
                    email: "ana@example.co",
                    specialty: { id: 2, name: "Medicina General" },
                    profilePhotoUrl: null,
                    isActive: true,
                    availability: [{ dayOfWeek: 1, startTime: "08:00", endTime: "12:00" }],
                },
            ],
            doctorOptions: [
                { id: 1, name: "Dra. Ana Torres", email: "ana@example.co", isActive: true },
            ],
            specialtyOptions: [{ id: 2, name: "Medicina General" }],
            exceptions: [
                {
                    id: 1,
                    doctorName: "Dra. Ana Torres",
                    type: "Unavailable",
                    reason: "Permiso personal",
                    startAt: "2026-10-27T13:00:00.000Z",
                    endAt: "2026-10-27T17:00:00.000Z",
                },
            ],
            week: { start: "2026-10-26", end: "2026-11-01" },
        };
    });
    await page.addScriptTag({ content: pageScript });
    await page.waitForTimeout(1000);
    await page.locator("[data-schedule-doctor-list]").getByText("Dra. Ana Torres").waitFor();
    await page.getByText("Permiso personal").waitFor();
    if ((await page.locator("[data-stat-active-doctors]").textContent()) !== "18") {
        throw new Error("The schedule page must render summary data from the API.");
    }
    await page.getByRole("button", { name: "Ver horario semanal" }).click();
    await page.locator("[data-weekly-content]").waitFor({ state: "visible" });
    await page.getByText("Cita #12").waitFor();
    const blockedPeriod = await page.locator(".weekly-event.is-blocked").textContent();
    if (!blockedPeriod.includes("No disponible") || !blockedPeriod.includes("Permiso")) {
        throw new Error("The weekly view must show unavailable exception reasons.");
    }
    const tuesdayColumn = page.locator(".weekly-day-column").nth(1);
    const blockedVacation = tuesdayColumn.locator(".weekly-event.is-blocked");
    const availableInterval = tuesdayColumn.locator(".weekly-event.is-available");
    if (!(await blockedVacation.getAttribute("style")).includes("width: 94%")) {
        throw new Error("Unavailable exceptions must cover the full day column.");
    }
    if (
        Number(await blockedVacation.evaluate((element) => getComputedStyle(element).zIndex)) <=
        Number(await availableInterval.evaluate((element) => getComputedStyle(element).zIndex))
    ) {
        throw new Error("Unavailable exceptions must visually cover regular availability.");
    }
    if (
        (await page.locator("[data-weekly-duration]").textContent()) !==
        "30 minutos · duración del sistema"
    ) {
        throw new Error(
            "The weekly panel should describe the shared 30-minute duration as system-defined.",
        );
    }
    console.log("PASS: weekly view shows persisted schedule states and doctor information.");

    await page.setViewportSize({ width: 375, height: 812 });
    const mobileTimelineHeights = await page
        .locator(".weekly-day-timeline")
        .evaluateAll((elements) =>
            elements.map((element) => element.getBoundingClientRect().height),
        );
    if (Math.max(...mobileTimelineHeights) > 160) {
        throw new Error("Mobile weekly schedule days should use compact event rows.");
    }
    if (!(await tuesdayColumn.locator(".weekly-event-time").first().isVisible())) {
        throw new Error("Mobile schedule rows must show their time range.");
    }
    if (
        !(await blockedVacation.locator(".weekly-event-time").textContent()).includes("Todo el día")
    ) {
        throw new Error("A full-day mobile exception should be labeled as such.");
    }

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
                `Schedule page overflows at ${viewport.label}: ${JSON.stringify(dimensions)}`,
            );
        }
        console.log(
            `PASS: schedule layout has no horizontal overflow at ${viewport.label} (${viewport.width}x${viewport.height}).`,
        );
    }

    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator("[data-week-next]").click();
    const navigatedWeek = await page.evaluate(() => window.weeklyRequests.at(-1).weekStart);
    if (navigatedWeek !== "2026-11-02")
        throw new Error("Week navigation must request the following Monday.");
    await page.locator("[data-weekly-clear]").click();
    await page.locator("[data-schedule-search]").fill("Dra. Ana");
    await page.getByRole("button", { name: "Buscar" }).click();
    const appliedSearch = await page.evaluate(() => window.scheduleRequests.at(-1).search);
    if (appliedSearch !== "Dra. Ana") throw new Error("Doctor search was not sent to the backend.");
    await page.locator("[data-schedule-search]").fill("sin-resultados");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByText("No hay médicos que coincidan con los filtros seleccionados.").waitFor();
    console.log("PASS: search applies filters and presents empty results.");

    await page.evaluate(() => {
        window.scheduleMode = "error";
    });
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.locator("[data-schedule-error]").waitFor({ state: "visible" });
    if (
        (await page.locator("[data-schedule-error]").textContent()) !==
        "No pudimos cargar los horarios."
    ) {
        throw new Error("The schedule page did not show the expected safe error message.");
    }
    console.log("PASS: server errors appear in an accessible alert.");
} finally {
    await browser.close();
}
