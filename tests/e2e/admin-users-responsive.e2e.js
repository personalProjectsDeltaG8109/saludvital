import { readFile } from "node:fs/promises";
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
            profilePhotoUrl: null,
            createdAt: "2026-10-30T12:00:00.000Z",
            lastLoginAt: "2026-11-02T12:00:00.000Z",
        },
    ],
    roles: [
        { id: 1, name: "Administrator" },
        { id: 2, name: "Patient" },
        { id: 3, name: "Doctor" },
    ],
    pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
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
const html = pug.renderFile(path.resolve("views/admin/users.pug"), {
    pageTitle: "Usuarios y roles | SaludVital",
    adminName: "Administradora de prueba",
});
const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage({ viewport: { width: 762, height: 900 } });
    await page.setContent(html);
    await page.evaluate(
        ({ listFixture, detailsFixture }) => {
            window.fetch = async (requestUrl) => {
                const pathname = String(requestUrl).split("?")[0];
                const payload = pathname === "/api/admin/users/7" ? detailsFixture : listFixture;
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
            const card = document.querySelector(".admin-user-card");
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
                viewportWidth: document.documentElement.clientWidth,
                documentWidth: document.documentElement.scrollWidth,
                cardWidth: cardBounds.width,
                cardScrollWidth: card.scrollWidth,
                childrenOverlap,
            };
        });

        if (dimensions.documentWidth > dimensions.viewportWidth) {
            throw new Error(`Users page overflows at ${width}px: ${JSON.stringify(dimensions)}.`);
        }
        if (dimensions.cardScrollWidth > dimensions.cardWidth + 1 || dimensions.childrenOverlap) {
            throw new Error(
                `User card is clipped or overlapping at ${width}px: ${JSON.stringify(dimensions)}.`,
            );
        }
        console.log(`PASS: administrator users layout fits at ${width}px.`);
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
} finally {
    await browser.close();
}
