import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import pug from "pug";
import { chromium } from "playwright";

const dashboardStyles = await readFile(path.resolve("public/css/admin-dashboard.css"), "utf8");
const userStyles = await readFile(path.resolve("public/css/admin-users.css"), "utf8");
const userScript = await readFile(path.resolve("public/js/admin-users.js"), "utf8");
const userFixture = {
    users: [
        {
            id: 7,
            displayName: "Dra. Laura Méndez",
            email: "laura.mendez@example.com",
            role: { id: 2, name: "Patient" },
            isActive: true,
            profileType: "Paciente",
            isDoctorProfile: false,
            hasPatientProfile: true,
            doctorId: null,
            profileMismatch: false,
            profilePhotoUrl: null,
            createdAt: "2026-10-30T12:00:00.000Z",
            lastLoginAt: "2026-11-02T12:00:00.000Z",
        },
        {
            id: 8,
            displayName: "Dr. Carlos Méndez",
            email: "carlos.mendez@example.com",
            role: { id: 3, name: "Doctor" },
            isActive: true,
            profileType: "Médico",
            isDoctorProfile: true,
            hasPatientProfile: false,
            doctorId: 12,
            profileMismatch: false,
            profilePhotoUrl: null,
            createdAt: "2026-10-29T12:00:00.000Z",
            lastLoginAt: "2026-11-03T12:00:00.000Z",
        },
    ],
    roles: [
        { id: 1, name: "Administrator" },
        { id: 2, name: "Patient" },
        { id: 3, name: "Doctor" },
    ],
    specialties: [{ id: 5, name: "Medicina General" }],
    pagination: { page: 1, pageSize: 10, totalItems: 2, totalPages: 1 },
};
const patientDetailsFixture = {
    user: {
        id: 7,
        email: "laura.mendez@example.com",
        profileType: "Patient",
        profilePhotoUrl: null,
        patient: {
            first_name: "Laura",
            last_name: "Méndez",
            phone: "3001234567",
            date_of_birth: "1990-01-01",
            document_type: "CC",
            document_number: "1234567890",
            departmentCode: "66",
            municipalityCode: "66001",
            address: "",
            profile_photo_url: null,
        },
        emergencyContact: null,
    },
    departments: [
        { code: "05", name: "Antioquia" },
        { code: "11", name: "Bogotá" },
        { code: "66", name: "Risaralda" },
    ],
    municipalities: [{ code: "66001", name: "Pereira" }],
};
const doctorDetailsFixture = {
    user: {
        id: 8,
        email: "carlos.mendez@example.com",
        profileType: "Doctor",
        profilePhotoUrl: "/uploads/profile-photos/carlos.webp",
        doctor: {
            display_name: "Dr. Carlos Méndez",
            first_name: "Carlos",
            last_name: "Méndez",
            document_type: "CC",
            document_number: "1234567890",
            professional_registration_number: "RM-12345",
            specialty_id: 5,
        },
    },
    specialties: [{ id: 5, name: "Medicina General" }],
};
const renderedHtml = pug.renderFile(path.resolve("views/admin/users.pug"), {
    pageTitle: "Usuarios y roles | SaludVital",
    adminName: "Administradora de prueba",
});
const brandImages = new Map();
for (const [, assetPath] of renderedHtml.matchAll(/src="(\/brand\/[^\"]+)"/g)) {
    if (brandImages.has(assetPath)) continue;
    const imagePath = path.resolve("public", assetPath.slice(1));
    const image = await readFile(imagePath);
    const mimeType = path.extname(imagePath) === ".ico" ? "image/x-icon" : "image/png";
    brandImages.set(assetPath, `data:${mimeType};base64,${image.toString("base64")}`);
}
const html = renderedHtml.replace(/src="(\/brand\/[^\"]+)"/g, (_, assetPath) => {
    return `src="${brandImages.get(assetPath)}"`;
});
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
});

async function verifyAccountEmailLength(page, profileLabel) {
    const emailInput = page.locator('[data-user-edit-fields] [name="email"]');
    await emailInput.waitFor();

    const maximumLength = await emailInput.evaluate((input) => input.maxLength);
    if (maximumLength !== 320) {
        throw new Error(`${profileLabel} account email must allow 320 characters.`);
    }

    for (const length of [100, 105, 320, 321]) {
        await emailInput.fill("");
        await emailInput.pressSequentially("x".repeat(length));
        const actualLength = (await emailInput.inputValue()).length;
        const expectedLength = Math.min(length, 320);

        if (actualLength !== expectedLength) {
            throw new Error(
                `${profileLabel} account email accepted ${actualLength} characters for an input of ${length}.`,
            );
        }
    }

    console.log(`PASS: ${profileLabel} account email accepts up to 320 characters.`);
}

try {
    const page = await browser.newPage({ viewport: { width: 762, height: 900 } });
    await page.route("http://saludvital.test/**", (route) =>
        route.fulfill({ contentType: "text/html", body: html }),
    );
    await page.goto("http://saludvital.test/admin/users");
    await page.evaluate(
        ({ listFixture, detailsFixture, doctorFixture }) => {
            const controls = {
                holdDetails: false,
                holdMunicipalities: false,
                pendingDetails: [],
                pendingMunicipalities: [],
                resolveDetail(userId, payload, ok = true) {
                    const index = this.pendingDetails.findIndex(
                        (request) => request.userId === Number(userId),
                    );
                    if (index < 0) return false;
                    const [request] = this.pendingDetails.splice(index, 1);
                    request.resolve({ ok, json: async () => payload });
                    return true;
                },
                resolveMunicipalities(departmentCode, payload, ok = true) {
                    const index = this.pendingMunicipalities.findIndex(
                        (request) => request.departmentCode === departmentCode,
                    );
                    if (index < 0) return false;
                    const [request] = this.pendingMunicipalities.splice(index, 1);
                    request.resolve({ ok, json: async () => payload });
                    return true;
                },
            };
            window.adminUsersTestControls = controls;
            window.fetch = async (requestUrl, requestOptions = {}) => {
                const requestUrlObject = new URL(requestUrl, window.location.origin);
                const pathname = requestUrlObject.pathname;
                const userDetailsMatch = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
                if (userDetailsMatch) {
                    const userId = Number(userDetailsMatch[1]);
                    if (controls.holdDetails) {
                        return new Promise((resolve) => {
                            controls.pendingDetails.push({ userId, resolve });
                        });
                    }
                    const userDetails = userId === 8 ? doctorFixture : detailsFixture;
                    return { ok: true, json: async () => userDetails };
                }
                if (pathname === "/api/admin/locations/municipalities") {
                    const departmentCode = requestUrlObject.searchParams.get("departmentCode");
                    if (controls.holdMunicipalities) {
                        return new Promise((resolve) => {
                            controls.pendingMunicipalities.push({ departmentCode, resolve });
                        });
                    }
                    return { ok: true, json: async () => detailsFixture.municipalities };
                }
                if (pathname === "/api/admin/users/7/role") {
                    const patient = listFixture.users.find((user) => user.id === 7);
                    patient.role = { id: 3, name: "Doctor" };
                    patient.profileType = "Médico";
                    patient.isDoctorProfile = true;
                    patient.doctorId = 14;
                    return {
                        ok: true,
                        json: async () => ({
                            message: "El perfil y el rol se actualizaron correctamente.",
                        }),
                    };
                }
                if (pathname === "/api/admin/doctors/12/status-impact") {
                    return { ok: true, json: async () => ({ upcomingAppointmentCount: 2 }) };
                }
                if (pathname === "/api/admin/doctors/12/status") {
                    const doctor = listFixture.users.find((user) => user.id === 8);
                    doctor.isActive = JSON.parse(requestOptions.body).isActive;
                    return {
                        ok: true,
                        json: async () => ({
                            message: "La cuenta se desactivó y se cancelaron 2 citas futuras.",
                        }),
                    };
                }
                const payload = listFixture;
                return { ok: true, json: async () => payload };
            };
        },
        {
            listFixture: userFixture,
            detailsFixture: patientDetailsFixture,
            doctorFixture: doctorDetailsFixture,
        },
    );
    await page.addStyleTag({ content: dashboardStyles });
    await page.addStyleTag({ content: userStyles });
    await page.addScriptTag({ content: userScript });
    await page.waitForTimeout(200);
    if (!(await page.locator(".admin-user-card").count())) {
        throw new Error(
            `User fixture did not render: ${await page.locator("[data-user-feedback]").innerText()}`,
        );
    }

    for (const width of [
        375, 760, 761, 762, 768, 800, 900, 960, 961, 1000, 1024, 1050, 1051, 1052, 1053, 1150, 1151,
        1160, 1161, 1440,
    ]) {
        await page.setViewportSize({ width, height: 900 });
        const dimensions = await page.evaluate(() => {
            const cards = [...document.querySelectorAll(".admin-user-card")].map((card) => {
                const cardBounds = card.getBoundingClientRect();
                const children = [...card.children].map((element) => {
                    const { left, right, top, bottom } = element.getBoundingClientRect();
                    return { left, right, top, bottom };
                });
                const childrenOverlap = children.some((item, index) =>
                    children
                        .slice(index + 1)
                        .some(
                            (other) =>
                                item.left < other.right - 1 &&
                                item.right > other.left + 1 &&
                                item.top < other.bottom - 1 &&
                                item.bottom > other.top + 1,
                        ),
                );
                return {
                    cardWidth: cardBounds.width,
                    cardScrollWidth: card.scrollWidth,
                    childrenOverlap,
                };
            });

            return {
                viewportWidth: document.documentElement.clientWidth,
                documentWidth: document.documentElement.scrollWidth,
                cards,
            };
        });

        if (dimensions.documentWidth > dimensions.viewportWidth) {
            throw new Error(`Users page overflows at ${width}px: ${JSON.stringify(dimensions)}.`);
        }
        if (
            dimensions.cards.some(
                (card) => card.cardScrollWidth > card.cardWidth + 1 || card.childrenOverlap,
            )
        ) {
            throw new Error(
                `User cards are clipped or overlapping at ${width}px: ${JSON.stringify(dimensions)}.`,
            );
        }
        console.log(`PASS: administrator users layout fits at ${width}px.`);
    }

    if (process.env.ADMIN_USERS_SCREENSHOT_DIR) {
        await mkdir(process.env.ADMIN_USERS_SCREENSHOT_DIR, { recursive: true });
        for (const [name, width, height] of [
            ["desktop", 1440, 1000],
            ["mobile", 390, 844],
        ]) {
            await page.setViewportSize({ width, height });
            await page.waitForTimeout(220);
            await page.screenshot({
                path: path.join(process.env.ADMIN_USERS_SCREENSHOT_DIR, `admin-users-${name}.png`),
                fullPage: true,
            });
        }
    }

    await page.evaluate(() => {
        window.adminUsersTestControls.holdDetails = true;
    });
    await page.locator('[data-user-edit-id="7"]').click();
    await page.waitForFunction(() =>
        window.adminUsersTestControls.pendingDetails.some((request) => request.userId === 7),
    );
    await page.locator("[data-user-modal-cancel]").click();
    await page.locator('[data-user-edit-id="8"]').click();
    await page.waitForFunction(() =>
        window.adminUsersTestControls.pendingDetails.some((request) => request.userId === 8),
    );
    await page.evaluate((details) => {
        window.adminUsersTestControls.resolveDetail(8, details);
    }, doctorDetailsFixture);
    await page.locator('[data-user-modal] [name="firstName"]').waitFor();
    await verifyAccountEmailLength(page, "doctor");
    if (
        (await page.locator('[data-user-modal] [name="firstName"]').inputValue()) !== "Carlos" ||
        (await page.locator('[data-user-modal] [name="lastName"]').inputValue()) !== "Méndez" ||
        (await page.locator('[data-user-modal] [name="professionalInformation"]').count()) !== 0 ||
        (await page.locator('[data-user-modal] [name="profilePhotoUrl"]').inputValue()) !==
            "/uploads/profile-photos/carlos.webp" ||
        (await page.locator(".admin-user-doctor-photo-preview img").getAttribute("src")) !==
            "/uploads/profile-photos/carlos.webp"
    ) {
        throw new Error("Doctor editor did not show the current profile fields and saved values.");
    }
    await page.evaluate((details) => {
        window.adminUsersTestControls.resolveDetail(7, details);
    }, patientDetailsFixture);
    await page.waitForTimeout(50);
    if (
        (await page.locator('[data-user-modal] [name="firstName"]').inputValue()) !== "Carlos" ||
        (await page.locator("[data-user-modal-feedback]").innerText())
    ) {
        throw new Error("An older user response changed the currently selected account editor.");
    }
    console.log("PASS: an older account response cannot replace the latest user editor.");
    await page.locator("[data-user-modal-cancel]").click();

    await page.evaluate(() => {
        window.adminUsersTestControls.holdDetails = true;
    });
    await page.locator('[data-user-edit-id="7"]').click();
    await page.waitForFunction(() =>
        window.adminUsersTestControls.pendingDetails.some((request) => request.userId === 7),
    );
    await page.locator("[data-user-modal-cancel]").click();
    await page.locator('[data-user-edit-id="8"]').click();
    await page.waitForFunction(() =>
        window.adminUsersTestControls.pendingDetails.some((request) => request.userId === 8),
    );
    await page.evaluate((details) => {
        window.adminUsersTestControls.resolveDetail(8, details);
    }, doctorDetailsFixture);
    await page.locator('[data-user-modal] [name="firstName"]').waitFor();
    await page.evaluate(() => {
        window.adminUsersTestControls.resolveDetail(
            7,
            { message: "No se pudo cargar una solicitud anterior." },
            false,
        );
    });
    await page.waitForTimeout(50);
    if (await page.locator("[data-user-modal-feedback]").innerText()) {
        throw new Error("An older account error replaced the current editor feedback.");
    }
    console.log("PASS: an older account error cannot replace the current editor.");
    await page.locator("[data-user-modal-cancel]").click();

    await page.evaluate(() => {
        window.adminUsersTestControls.holdDetails = true;
    });
    await page.locator('[data-user-edit-id="7"]').click();
    await page.waitForFunction(() =>
        window.adminUsersTestControls.pendingDetails.some((request) => request.userId === 7),
    );
    await page.locator("[data-user-modal-cancel]").click();
    await page.evaluate((details) => {
        window.adminUsersTestControls.resolveDetail(7, details);
        window.adminUsersTestControls.holdDetails = false;
    }, patientDetailsFixture);
    await page.waitForTimeout(50);
    if (
        !(await page.locator("[data-user-modal]").isHidden()) ||
        (await page.locator('[name="firstName"]').count())
    ) {
        throw new Error("An older user response reopened a closed editor.");
    }
    console.log("PASS: closing the editor prevents a pending response from reopening it.");

    await page.locator('[data-user-edit-id="7"]').click();
    const emergencySection = page
        .locator(".admin-user-form-section")
        .filter({ has: page.getByRole("heading", { name: "Contacto de emergencia" }) });
    await emergencySection.waitFor();
    await verifyAccountEmailLength(page, "patient");
    const emergencyNote = await emergencySection.locator(".admin-user-form-hint").innerText();
    if (
        !emergencyNote.includes("usa información ficticia") ||
        !emergencyNote.includes("envía mensajes")
    ) {
        throw new Error(`Emergency-contact guidance is missing or unclear: ${emergencyNote}`);
    }
    console.log("PASS: administrator edit dialog explains emergency-contact demo use.");

    await page.evaluate(() => {
        window.adminUsersTestControls.holdMunicipalities = true;
    });
    const departmentSelect = page.locator('[name="departmentCode"]');
    const municipalitySelect = page.locator('[name="municipalityCode"]');
    await departmentSelect.selectOption("05");
    await page.waitForFunction(() =>
        window.adminUsersTestControls.pendingMunicipalities.some(
            (request) => request.departmentCode === "05",
        ),
    );
    await departmentSelect.selectOption("11");
    await page.waitForFunction(() =>
        window.adminUsersTestControls.pendingMunicipalities.some(
            (request) => request.departmentCode === "11",
        ),
    );
    await page.evaluate(() => {
        window.adminUsersTestControls.resolveMunicipalities("11", [
            { code: "11001", name: "Bogotá" },
        ]);
    });
    await page.waitForFunction(() =>
        [...document.querySelector('[name="municipalityCode"]').options].some(
            (option) => option.value === "11001",
        ),
    );
    await page.evaluate(() => {
        window.adminUsersTestControls.resolveMunicipalities("05", [
            { code: "05001", name: "Medellín" },
        ]);
    });
    await page.waitForTimeout(50);
    const currentMunicipalities = await municipalitySelect
        .locator("option")
        .evaluateAll((options) => options.map((option) => option.value));
    if (currentMunicipalities.join(",") !== ",11001") {
        throw new Error(
            `An older department response replaced current municipalities: ${currentMunicipalities}.`,
        );
    }

    await departmentSelect.selectOption("66");
    await page.waitForFunction(() =>
        window.adminUsersTestControls.pendingMunicipalities.some(
            (request) => request.departmentCode === "66",
        ),
    );
    await departmentSelect.selectOption("05");
    await page.waitForFunction(() =>
        window.adminUsersTestControls.pendingMunicipalities.some(
            (request) => request.departmentCode === "05",
        ),
    );
    await page.evaluate(() => {
        window.adminUsersTestControls.resolveMunicipalities("05", [
            { code: "05001", name: "Medellín" },
        ]);
    });
    await page.waitForFunction(() =>
        [...document.querySelector('[name="municipalityCode"]').options].some(
            (option) => option.value === "05001",
        ),
    );
    await page.evaluate(() => {
        window.adminUsersTestControls.resolveMunicipalities(
            "66",
            { message: "Error de una solicitud anterior." },
            false,
        );
        window.adminUsersTestControls.holdMunicipalities = false;
    });
    await page.waitForTimeout(50);
    const currentDepartmentFeedback = await page.locator("[data-user-modal-feedback]").innerText();
    if (
        (await municipalitySelect
            .locator("option")
            .evaluateAll((options) => options.map((option) => option.value).join(","))) !==
            ",05001" ||
        currentDepartmentFeedback
    ) {
        throw new Error("An older department error changed the current municipality selection.");
    }
    console.log("PASS: only municipalities for the latest department remain available.");
    await page.locator("[data-user-modal-cancel]").click();

    const patientRole = page.getByRole("combobox", { name: "Rol de Dra. Laura Méndez" });
    if (await patientRole.locator('option[value="3"]').count()) {
        throw new Error("The general role editor must not promote a patient to doctor.");
    }
    console.log("PASS: doctor accounts must be created through the protected invitation flow.");

    await page.getByRole("button", { name: "Desactivar la cuenta de Dr. Carlos Méndez" }).click();
    const doctorStatusDialog = page.locator("dialog.admin-user-doctor-status-dialog");
    await doctorStatusDialog.waitFor();
    const impactMessage = await doctorStatusDialog.innerText();
    if (!impactMessage.includes("2 citas futuras confirmadas se cancelarán")) {
        throw new Error(
            `Doctor deactivation did not explain the appointment impact: ${impactMessage}.`,
        );
    }
    if (process.env.ADMIN_USERS_SCREENSHOT_DIR) {
        await page.screenshot({
            path: path.join(
                process.env.ADMIN_USERS_SCREENSHOT_DIR,
                "admin-users-deactivation-confirmation.png",
            ),
            fullPage: true,
        });
    }
    await doctorStatusDialog.getByRole("button", { name: "Desactivar cuenta" }).click();
    await page.getByRole("button", { name: "Activar la cuenta de Dr. Carlos Méndez" }).waitFor();
    console.log("PASS: doctor deactivation confirms future appointment cancellations.");
} finally {
    await browser.close();
}
