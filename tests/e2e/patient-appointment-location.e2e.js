import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import pug from "pug";

const cssFiles = [
    "public/css/app.css",
    "public/css/patient-dashboard.css",
    "public/css/patient-appointments.css",
    "public/css/patient-reschedule.css",
];
const styles = await Promise.all(cssFiles.map((file) => readFile(path.resolve(file), "utf8")));
const appointmentsScript = await readFile(
    path.resolve("public/js/patient-appointments.js"),
    "utf8",
);
const appointment = {
    id: 84,
    start_at: "2026-12-20T15:00:00.000Z",
    end_at: "2026-12-20T15:30:00.000Z",
    status: { name: "Confirmed" },
    specialty: { name: "Medicina General" },
    doctor: { display_name: "Doctora de prueba" },
    doctor_label: "Doctora de prueba",
    doctor_id: 12,
    history: [],
};
const missedAppointment = {
    ...appointment,
    id: 85,
    start_at: "2026-10-20T15:00:00.000Z",
    end_at: "2026-10-20T15:30:00.000Z",
    status: { name: "No Show" },
};
const commonLocals = {
    pageTitle: "Mis citas | SaludVital",
    activeNav: "appointments",
    patientName: "Paciente de prueba",
    patientPhotoUrl: null,
    notificationCount: 0,
    notificationLabel: "Notificaciones",
};
const appointmentsHtml = pug.renderFile("views/patient/appointments.pug", {
    ...commonLocals,
    appointments: [appointment, missedAppointment],
    appointmentStats: [
        { key: "all", label: "Total de citas", status: null, count: 2 },
        { key: "confirmed", label: "Confirmadas", status: "Confirmed", count: 1 },
        { key: "attended", label: "Atendidas", status: "Attended", count: 0 },
        { key: "cancelled", label: "Canceladas", status: "Cancelled", count: 0 },
        { key: "no-show", label: "No asistió", status: "No Show", count: 1 },
    ],
    specialties: ["Medicina General"],
    filters: { filter: "all", status: "", search: "", specialty: "" },
    pagination: {
        page: 1,
        pageSize: 10,
        total: 2,
        totalPages: 1,
        firstResult: 1,
        lastResult: 2,
        previousUrl: null,
        nextUrl: null,
    },
    previewMode: false,
    previewAvailable: false,
});
const rescheduleHtml = pug.renderFile("views/patient/reschedule-appointment.pug", {
    ...commonLocals,
    activeNav: "reschedule",
    appointments: [appointment],
    selectedAppointmentId: appointment.id,
});
const rescheduleScript = await readFile(path.resolve("public/js/patient-reschedule.js"), "utf8");
const browser = await chromium.launch({ headless: true });

async function loadPage(page, html) {
    await page.setContent(html);
    for (const style of styles) await page.addStyleTag({ content: style });
}

async function verifyResponsiveWidths(page, pageName) {
    for (const width of [320, 375, 760, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const overflow = await page.evaluate(() => {
            const viewportWidth = document.documentElement.clientWidth;
            const elements = [...document.querySelectorAll("body *")]
                .map((element) => ({
                    className: typeof element.className === "string" ? element.className : "",
                    right: Math.ceil(element.getBoundingClientRect().right),
                    tagName: element.tagName.toLowerCase(),
                }))
                .filter((element) => element.right > viewportWidth + 1)
                .slice(0, 5);

            return {
                hasHorizontalOverflow: document.documentElement.scrollWidth > viewportWidth,
                elements,
            };
        });
        if (overflow.hasHorizontalOverflow) {
            throw new Error(
                `${pageName} has horizontal overflow at ${width}px: ${JSON.stringify(overflow.elements)}.`,
            );
        }
    }
}

async function verifyRescheduleStepper(page) {
    for (const width of [320, 360, 390, 540, 760, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const invalidStep = await page.locator(".reschedule-stepper li").evaluateAll(
            (steps) =>
                steps.find((step) => {
                    const number = step.querySelector(".reschedule-step-button > span").getBoundingClientRect();
                    const label = step.querySelector(".reschedule-step-button > strong").getBoundingClientRect();
                    const stepBounds = step.getBoundingClientRect();
                    const connector = getComputedStyle(step, "::after").content;

                    return (
                        label.left < number.right ||
                        label.right > stepBounds.right ||
                        (connector !== "none" && connector !== "normal")
                    );
                })?.dataset.rescheduleStep,
        );

        if (invalidStep) {
            throw new Error(
                `Reschedule step ${invalidStep} overlaps its number or connector at ${width}px.`,
            );
        }
    }
}

try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await loadPage(page, appointmentsHtml);
    await page.addScriptTag({ content: appointmentsScript });
    if (await page.getByText("Sede", { exact: true }).count()) {
        throw new Error("Mis citas must not show an unsupported clinic location.");
    }
    await page
        .locator("#appointment-84 [data-label='Especialidad']")
        .getByText("Medicina General")
        .waitFor();
    await page
        .locator("#appointment-84 .appointment-doctor-cell")
        .getByText("Doctora de prueba")
        .waitFor();
    await page.getByRole("button", { name: "Ver detalles" }).first().waitFor();
    await page.locator("#appointment-85 .appointment-status").first().waitFor();
    await page.evaluate(() => {
        document.querySelector("#appointment-filters").addEventListener("submit", (event) => {
            event.preventDefault();
            window.submittedFilters = new URLSearchParams(
                new FormData(event.currentTarget),
            ).toString();
        });
    });
    await page.getByRole("button", { name: "No asistió", exact: true }).click();
    if (
        !(await page.locator("#appointment-85").isVisible()) ||
        !(await page.locator("#appointment-84").isVisible())
    ) {
        throw new Error("Server-side filters should preserve the rendered page until navigation.");
    }
    if (!(await page.evaluate(() => window.submittedFilters.includes("filter=no-show")))) {
        throw new Error("Selecting a quick filter must submit the selected filter to the server.");
    }
    await page.locator(".appointment-tools select[data-status]").selectOption("No Show");
    await page.locator(".appointment-tools select[data-status]").selectOption("");
    await verifyResponsiveWidths(page, "Mis citas");

    await loadPage(page, rescheduleHtml);
    await page.evaluate(() => {
        window.fetch = async (url) =>
            new Response(
                JSON.stringify({
                    success: true,
                    data: String(url).includes("/availability") ? ["09:00"] : [],
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                },
            );
    });
    await page.addScriptTag({ content: rescheduleScript });
    await page.locator('[data-next-step="2"]').click();
    await page.locator(".reschedule-time-option").first().click();
    await page.locator('[data-next-step="3"]').click();
    await page.locator('[data-reschedule-panel="3"]').waitFor({ state: "visible" });
    await page.locator("[data-summary-doctor]").getByText("Doctora de prueba").waitFor();
    await page.locator("[data-summary-specialty]").getByText("Medicina General").waitFor();
    if (await page.getByText("Sede", { exact: true }).count()) {
        throw new Error("The rescheduling list and summary must not show a clinic location.");
    }
    await verifyResponsiveWidths(page, "Reprogramar cita");
    await verifyRescheduleStepper(page);

    const accessibility = await new AxeBuilder({ page }).analyze();
    if (accessibility.violations.length) {
        throw new Error(`Accessibility violations: ${JSON.stringify(accessibility.violations)}`);
    }

    console.log("Patient appointment location removal passed responsive and accessibility checks.");
} finally {
    await browser.close();
}
