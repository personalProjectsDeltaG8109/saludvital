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
    departments: [{ code: "66", name: "Risaralda" }],
    municipalities: [{ code: "66001", name: "Pereira" }],
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
const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage({ viewport: { width: 762, height: 900 } });
    await page.setContent(html);
    await page.evaluate(
        ({ listFixture, detailsFixture }) => {
            window.fetch = async (requestUrl, requestOptions = {}) => {
                const pathname = String(requestUrl).split("?")[0];
                if (pathname === "/api/admin/users/7") {
                    return { ok: true, json: async () => detailsFixture };
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
        { listFixture: userFixture, detailsFixture: patientDetailsFixture },
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

    await page.locator('[data-user-edit-id="7"]').click();
    const emergencySection = page
        .locator(".admin-user-form-section")
        .filter({ has: page.getByRole("heading", { name: "Contacto de emergencia" }) });
    await emergencySection.waitFor();
    const emergencyNote = await emergencySection.locator(".admin-user-form-hint").innerText();
    if (
        !emergencyNote.includes("usa información ficticia") ||
        !emergencyNote.includes("envía mensajes")
    ) {
        throw new Error(`Emergency-contact guidance is missing or unclear: ${emergencyNote}`);
    }
    console.log("PASS: administrator edit dialog explains emergency-contact demo use.");
    await page.locator("[data-user-modal-cancel]").click();

    const patientRole = page.getByRole("combobox", { name: "Rol de Dra. Laura Méndez" });
    await patientRole.selectOption("3");
    const roleDialog = page.locator("[data-role-dialog]");
    await roleDialog.waitFor();
    await roleDialog.getByLabel("Nombre profesional").fill("Dra. Laura Méndez");
    await roleDialog.getByLabel("Especialidad").selectOption("5");
    if (process.env.ADMIN_USERS_SCREENSHOT_DIR) {
        await page.screenshot({
            path: path.join(process.env.ADMIN_USERS_SCREENSHOT_DIR, "admin-users-role-modal.png"),
            fullPage: true,
        });
    }
    await roleDialog.getByRole("button", { name: "Guardar rol y perfil" }).click();
    await page.getByRole("combobox", { name: "Rol de Dra. Laura Méndez" }).waitFor();
    const convertedProfile = await page
        .locator(".admin-user-card")
        .filter({ hasText: "laura.mendez@example.com" })
        .locator(".admin-user-profile strong")
        .innerText();
    if (convertedProfile !== "Médico") {
        throw new Error(`Role conversion did not refresh the profile type: ${convertedProfile}.`);
    }
    console.log("PASS: changing a patient to doctor creates and displays the doctor profile.");

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
