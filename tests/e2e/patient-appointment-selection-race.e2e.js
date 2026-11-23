import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import pug from "pug";

const bookingScript = await readFile(
    path.resolve("public/js/patient-appointment-booking.js"),
    "utf8",
);
const rescheduleScript = await readFile(path.resolve("public/js/patient-reschedule.js"), "utf8");
const specialties = [
    { id: 1, name: "Medicina General", description: "Atención primaria" },
    { id: 2, name: "Dermatología", description: "Salud de la piel" },
];
const doctorsBySpecialty = {
    1: [{ id: 11, display_name: "Dra. Selección anterior" }],
    2: [{ id: 22, display_name: "Dr. Selección actual" }],
};
const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
});

function addDays(dateKey, amount) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

function sameMonth(firstDate, secondDate) {
    return firstDate.slice(0, 7) === secondDate.slice(0, 7);
}

async function installDeferredFetch(page) {
    await page.evaluate((availableSpecialties) => {
        window.__pendingApiRequests = [];
        window.fetch = (url, options = {}) => {
            const requestUrl = String(url);
            if (requestUrl === "/api/patient/specialties") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ success: true, data: availableSpecialties }),
                });
            }

            return new Promise((resolve) => {
                window.__pendingApiRequests.push({ requestUrl, options, resolve });
            });
        };
        window.__respondToApiRequest = (urlPart, result) => {
            const requestIndex = window.__pendingApiRequests.findIndex((request) =>
                request.requestUrl.includes(urlPart),
            );
            if (requestIndex === -1) throw new Error(`No pending request matched ${urlPart}`);

            const [{ resolve }] = window.__pendingApiRequests.splice(requestIndex, 1);
            const status = result.status || (result.success === false ? 500 : 200);
            resolve({
                ok: status >= 200 && status < 300,
                json: async () => ({
                    success: result.success !== false,
                    data: result.data,
                    message: result.message,
                }),
            });
        };
    }, specialties);
}

async function waitForRequest(page, urlPart) {
    await page.waitForFunction(
        (matchingUrl) =>
            window.__pendingApiRequests.some((request) => request.requestUrl.includes(matchingUrl)),
        urlPart,
    );
}

async function respondToRequest(page, urlPart, result) {
    await page.evaluate(
        ({ matchingUrl, response }) => window.__respondToApiRequest(matchingUrl, response),
        { matchingUrl: urlPart, response: result },
    );
}

async function chooseBookingDate(page, dateKey) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const dateButton = page.locator(`#calendar-days [data-date="${dateKey}"]`);
        if (await dateButton.count()) {
            await dateButton.click();
            return;
        }
        await page.locator('[data-month-shift="1"]').click();
    }
    throw new Error(`The booking calendar did not show ${dateKey}.`);
}

async function getTwoAvailableBookingDates(page) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const dates = await page
            .locator("#calendar-days [data-date]:not([disabled])")
            .evaluateAll((buttons) => buttons.map((button) => button.dataset.date));
        for (let index = 0; index < dates.length - 1; index += 1) {
            if (sameMonth(dates[index], dates[index + 1])) {
                return [dates[index], dates[index + 1]];
            }
        }
        await page.locator('[data-month-shift="1"]').click();
    }
    throw new Error("The booking calendar did not show two future dates in one month.");
}

async function chooseRescheduleDate(page, dateKey) {
    const dayNumber = String(Number(dateKey.slice(-2)));
    const dayButton = page
        .locator("[data-calendar-days] button")
        .filter({ hasText: new RegExp(`^${dayNumber}$`) });
    if ((await dayButton.count()) !== 1) {
        throw new Error(`The rescheduling calendar did not show day ${dayNumber}.`);
    }
    await dayButton.click();
}

function renderBookingPage() {
    return pug.renderFile(path.resolve("views/patient/request-appointment.pug"), {
        pageTitle: "Pedir una nueva cita | SaludVital",
        activeNav: "book",
        patientName: "Paciente de prueba",
        patientPhotoUrl: null,
        notificationCount: 0,
        notificationLabel: "Notificaciones",
    });
}

function renderReschedulePage(appointments) {
    return pug.renderFile(path.resolve("views/patient/reschedule-appointment.pug"), {
        pageTitle: "Reprogramar cita | SaludVital",
        activeNav: "reschedule",
        patientName: "Paciente de prueba",
        patientPhotoUrl: null,
        notificationCount: 0,
        appointments,
        selectedAppointmentId: null,
    });
}

async function verifyBookingSelectionRace() {
    const page = await browser.newPage({ timezoneId: "America/Bogota" });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    try {
        await page.setContent(renderBookingPage());
        await installDeferredFetch(page);
        await page.addScriptTag({ content: bookingScript });
        await page.locator('[data-specialty-id="1"]').waitFor();

        await page.locator('[data-specialty-id="1"]').click();
        await waitForRequest(page, "/specialties/1/doctors");
        await page.locator("[data-booking-back]").click();
        await page.locator('[data-specialty-id="2"]').click();
        await waitForRequest(page, "/specialties/2/doctors");
        await respondToRequest(page, "/specialties/2/doctors", {
            data: doctorsBySpecialty[2],
        });
        await page.getByText("Dr. Selección actual").waitFor();
        await respondToRequest(page, "/specialties/1/doctors", {
            data: doctorsBySpecialty[1],
        });
        await page.waitForTimeout(20);
        assert.equal(await page.locator('[data-doctor-id="22"]').count(), 1);
        assert.equal(await page.locator('[data-doctor-id="11"]').count(), 0);

        await page.locator("[data-booking-back]").click();
        await page.locator('[data-specialty-id="1"]').click();
        await waitForRequest(page, "/specialties/1/doctors");
        await page.locator("[data-booking-back]").click();
        await page.locator('[data-specialty-id="2"]').click();
        await waitForRequest(page, "/specialties/2/doctors");
        await respondToRequest(page, "/specialties/2/doctors", {
            data: doctorsBySpecialty[2],
        });
        await page.getByText("Dr. Selección actual").waitFor();
        await respondToRequest(page, "/specialties/1/doctors", {
            status: 500,
            success: false,
            message: "Error de una selección anterior",
        });
        await page.waitForTimeout(20);
        assert.equal(await page.locator('[data-doctor-id="22"]').count(), 1);
        assert.equal(await page.getByText("Error de una selección anterior").count(), 0);

        await page.locator('[data-doctor-id="22"]').click();
        const [firstDate, secondDate] = await getTwoAvailableBookingDates(page);

        await chooseBookingDate(page, firstDate);
        await waitForRequest(page, `date=${firstDate}`);
        await chooseBookingDate(page, secondDate);
        await waitForRequest(page, `date=${secondDate}`);
        await respondToRequest(page, `date=${secondDate}`, { data: ["10:00"] });
        await page.locator('.booking-time-option[data-time="10:00"]').waitFor();
        await respondToRequest(page, `date=${firstDate}`, { data: ["07:00"] });
        await page.waitForTimeout(20);
        assert.deepEqual(
            await page
                .locator(".booking-time-option")
                .evaluateAll((buttons) => buttons.map((button) => button.dataset.time)),
            ["10:00"],
        );

        await chooseBookingDate(page, firstDate);
        await waitForRequest(page, `date=${firstDate}`);
        await chooseBookingDate(page, secondDate);
        await waitForRequest(page, `date=${secondDate}`);
        await respondToRequest(page, `date=${secondDate}`, { data: ["11:00"] });
        await page.locator('.booking-time-option[data-time="11:00"]').waitFor();
        await respondToRequest(page, `date=${firstDate}`, {
            status: 500,
            success: false,
            message: "Error de una fecha anterior",
        });
        await page.waitForTimeout(20);
        assert.deepEqual(
            await page
                .locator(".booking-time-option")
                .evaluateAll((buttons) => buttons.map((button) => button.dataset.time)),
            ["11:00"],
        );
        assert.equal(await page.getByText("Error de una fecha anterior").count(), 0);

        await page.locator('.booking-time-option[data-time="11:00"]').click();
        assert.match(await page.locator("#booking-summary").innerText(), /Dr\. Selección actual/);
        await page.locator(".booking-submit").click();
        await waitForRequest(page, "/api/patient/appointments");
        const submittedBody = await page.evaluate(() => {
            const request = window.__pendingApiRequests.find(
                (item) => item.requestUrl === "/api/patient/appointments",
            );
            return JSON.parse(request.options.body);
        });
        assert.deepEqual(submittedBody, {
            specialtyId: 2,
            doctorId: 22,
            date: secondDate,
            time: "11:00",
            reason: "",
        });
        await respondToRequest(page, "/api/patient/appointments", { data: { id: 91 } });
        await page.locator("#appointment-success-dialog[open]").waitFor();
        assert.deepEqual(pageErrors, []);
    } finally {
        await page.close();
    }
}

async function verifyRescheduleSelectionRace() {
    const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
    const firstAppointmentDate = addDays(today, 15);
    const nextDate = addDays(firstAppointmentDate, 1);
    const alternateDate = sameMonth(firstAppointmentDate, nextDate)
        ? nextDate
        : addDays(firstAppointmentDate, -1);
    const secondAppointmentDate = addDays(today, 25);
    const appointments = [
        {
            id: 123,
            doctor_id: 42,
            doctor_label: "Dr. Selección anterior",
            specialty: { name: "Medicina general" },
            start_at: `${firstAppointmentDate}T15:00:00.000Z`,
            history: [],
        },
        {
            id: 124,
            doctor_id: 43,
            doctor_label: "Dra. Selección actual",
            specialty: { name: "Dermatología" },
            start_at: `${secondAppointmentDate}T15:00:00.000Z`,
            history: [],
        },
    ];
    const page = await browser.newPage({ timezoneId: "America/Bogota" });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    try {
        await page.setContent(renderReschedulePage(appointments));
        await installDeferredFetch(page);
        await page.addScriptTag({ content: rescheduleScript });
        const appointmentInputs = page.locator('input[name="appointmentId"]');
        await appointmentInputs.nth(0).check();
        await page.locator('[data-next-step="2"]').click();
        await waitForRequest(page, `date=${firstAppointmentDate}`);

        await chooseRescheduleDate(page, alternateDate);
        await waitForRequest(page, `date=${alternateDate}`);
        await respondToRequest(page, `date=${alternateDate}`, { data: ["10:00"] });
        await page.locator(".reschedule-time-option").first().waitFor();
        await respondToRequest(page, `date=${firstAppointmentDate}`, { data: ["07:00"] });
        await page.waitForTimeout(20);
        assert.deepEqual(await page.locator(".reschedule-time-option").allTextContents(), [
            "10:00 a. m.",
        ]);

        await chooseRescheduleDate(page, firstAppointmentDate);
        await waitForRequest(page, `date=${firstAppointmentDate}`);
        await chooseRescheduleDate(page, alternateDate);
        await waitForRequest(page, `date=${alternateDate}`);
        await respondToRequest(page, `date=${alternateDate}`, { data: ["11:00"] });
        await page.locator(".reschedule-time-option").first().waitFor();
        await respondToRequest(page, `date=${firstAppointmentDate}`, {
            status: 500,
            success: false,
            message: "Error de una fecha anterior",
        });
        await page.waitForTimeout(20);
        assert.deepEqual(await page.locator(".reschedule-time-option").allTextContents(), [
            "11:00 a. m.",
        ]);
        assert.equal(await page.getByText("Error de una fecha anterior").count(), 0);

        await chooseRescheduleDate(page, firstAppointmentDate);
        await waitForRequest(page, `date=${firstAppointmentDate}`);
        await page.locator('[data-back-step="1"]').click();
        await appointmentInputs.nth(1).check();
        await page.locator('[data-next-step="2"]').click();
        await waitForRequest(page, `date=${secondAppointmentDate}`);
        await respondToRequest(page, `date=${secondAppointmentDate}`, { data: ["13:00"] });
        await page.locator(".reschedule-time-option").first().waitFor();
        await respondToRequest(page, `date=${firstAppointmentDate}`, { data: ["06:00"] });
        await page.waitForTimeout(20);
        assert.deepEqual(await page.locator(".reschedule-time-option").allTextContents(), [
            "1:00 p. m.",
        ]);
        assert.deepEqual(pageErrors, []);
    } finally {
        await page.close();
    }
}

try {
    await verifyBookingSelectionRace();
    console.log("PASS: booking ignores outdated doctor and availability responses.");
    await verifyRescheduleSelectionRace();
    console.log("PASS: rescheduling ignores outdated date and appointment responses.");
} finally {
    await browser.close();
}
