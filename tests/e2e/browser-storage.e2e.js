import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import bcrypt from "bcrypt";
import { chromium } from "playwright";
import { setTimeout as delay } from "node:timers/promises";

const testDatabaseName = "saludvital_test";
const testJwtSecret = "local-test-secret-not-for-production";
const baseUrl = "http://127.0.0.1:3101";
const testPassword = "BrowserAudit123!";

// Force the dedicated test database before loading the application configuration.
process.env.NODE_ENV = "test";
process.env.DB_NAME = testDatabaseName;
process.env.JWT_SECRET = testJwtSecret;

const [{ default: environment }, { default: database }, models, { default: AuthSession }] =
    await Promise.all([
        import("../../config/environment.js"),
        import("../../config/database.js"),
        import("../../src/models/associations.js"),
        import("../../src/models/AuthSession.js"),
    ]);

if (environment.database.name !== testDatabaseName) {
    throw new Error("Browser storage audit requires the dedicated saludvital_test database.");
}

const { Doctor, Patient, Rol, Specialities, User } = models;
const roleDashboards = [
    { name: "Patient", path: "/patient/dashboard" },
    { name: "Doctor", path: "/doctor/dashboard" },
    { name: "Administrator", path: "/admin/dashboard" },
];
const createdUsers = [];
let createdSpecialty = null;
let createdAuditSpecialty = false;

function createServerEnvironment() {
    return {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        NODE_ENV: "test",
        DB_HOST: environment.database.host,
        DB_PORT: String(environment.database.port),
        DB_NAME: testDatabaseName,
        DB_USER: environment.database.user,
        DB_PASSWORD: environment.database.password,
        JWT_SECRET: testJwtSecret,
        PORT: "3101",
        APP_BASE_URL: baseUrl,
        NOTIFICATION_DELIVERY_ENABLED: "false",
        NOTIFICATION_TEST_RECIPIENTS: "",
        WHATSAPP_CHATBOT_ENABLED: "false",
        META_WHATSAPP_ACCESS_TOKEN: "",
        META_WHATSAPP_APP_SECRET: "",
        META_WHATSAPP_WEBHOOK_VERIFY_TOKEN: "",
        META_WHATSAPP_PHONE_NUMBER_ID: "",
        META_WHATSAPP_BUSINESS_ACCOUNT_ID: "",
        RESEND_API_KEY: "",
        RESEND_FROM_EMAIL: "",
        INALAMBRIA_REST_USERNAME: "",
        INALAMBRIA_REST_PASSWORD: "",
        WHATSAPP_VERIFICATION_SECRET: "",
    };
}

async function createAuditAccounts() {
    await database.authenticate();

    const specialty = await Specialities.findOne({
        where: { is_active: true },
        attributes: ["id"],
    });
    if (specialty) {
        createdSpecialty = specialty;
    } else {
        createdSpecialty = await Specialities.create({
            name: `Browser audit ${randomUUID().slice(0, 8)}`,
            is_active: true,
        });
        createdAuditSpecialty = true;
    }

    for (const roleCase of roleDashboards) {
        const role = await Rol.findOne({
            where: { name: roleCase.name },
            attributes: ["id"],
        });
        if (!role) throw new Error(`The ${roleCase.name} role is missing from saludvital_test.`);

        const user = await User.create({
            role_id: role.id,
            email: `browser-audit-${roleCase.name.toLowerCase()}-${randomUUID()}@example.test`,
            password_hash: await bcrypt.hash(testPassword, 4),
            is_active: true,
            email_verified_at: new Date(),
        });
        createdUsers.push(user);

        if (roleCase.name === "Patient") {
            await Patient.create({
                user_id: user.id,
                first_name: "Paciente",
                last_name: "Prueba",
                phone: "3000000000",
                date_of_birth: "1990-01-01",
                document_type: "CC",
                document_number: `${Date.now()}1`,
                department: "Risaralda",
                municipality: "Pereira",
            });
        }

        if (roleCase.name === "Doctor") {
            await Doctor.create({
                user_id: user.id,
                specialty_id: createdSpecialty.id,
                display_name: "Médico de prueba",
            });
        }

        roleCase.email = user.email;
    }
}

async function readBrowserStorage(page) {
    return page.evaluate(async () => {
        const externalAssets = Array.from(
            document.querySelectorAll("script[src], link[href], img[src], iframe[src]"),
        )
            .map((element) => element.src || element.href)
            .filter(
                (resourceUrl) => resourceUrl && new URL(resourceUrl).origin !== location.origin,
            );

        return {
            localStorageKeys: Object.keys(localStorage),
            sessionStorageKeys: Object.keys(sessionStorage),
            indexedDatabaseNames: (await indexedDB.databases()).map(({ name }) => name),
            serviceWorkerCount: (await navigator.serviceWorker.getRegistrations()).length,
            frameCount: window.frames.length,
            externalAssets,
            documentCookie: document.cookie,
        };
    });
}

function assertNoOptionalBrowserStorage(snapshot, roleName) {
    assert.deepEqual(snapshot.localStorageKeys, [], `${roleName}: localStorage should be empty.`);
    assert.deepEqual(
        snapshot.sessionStorageKeys,
        [],
        `${roleName}: sessionStorage should be empty.`,
    );
    assert.deepEqual(snapshot.indexedDatabaseNames, [], `${roleName}: IndexedDB should be empty.`);
    assert.equal(snapshot.serviceWorkerCount, 0, `${roleName}: unexpected service worker.`);
    assert.equal(snapshot.frameCount, 0, `${roleName}: unexpected embedded frame.`);
    assert.deepEqual(snapshot.externalAssets, [], `${roleName}: unexpected external asset.`);
    assert.equal(
        snapshot.documentCookie.includes("token="),
        false,
        "The token must remain HttpOnly.",
    );
}

async function verifyRoleSession(browser, roleCase) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const externalRequestOrigins = new Set();
    const localOrigin = new URL(baseUrl).origin;

    page.on("request", (request) => {
        const requestOrigin = new URL(request.url()).origin;
        if (requestOrigin !== localOrigin) externalRequestOrigins.add(requestOrigin);
    });

    try {
        await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
        await page.locator("[data-login-splash]").waitFor({ state: "detached", timeout: 12000 });
        assert.deepEqual(
            await context.cookies(baseUrl),
            [],
            "A clean browser should start without cookies.",
        );
        assertNoOptionalBrowserStorage(await readBrowserStorage(page), "Login page");

        await page.locator('input[name="email"]').fill(roleCase.email);
        await page.locator('input[name="password"]').fill(testPassword);

        const dashboardNavigation = page.waitForURL(`${baseUrl}${roleCase.path}`);
        await page.locator('form[action="/login"] button[type="submit"]').click();
        await dashboardNavigation;

        const authenticationCookies = await context.cookies(baseUrl);
        assert.equal(
            authenticationCookies.length,
            1,
            "Only the authentication cookie is expected.",
        );
        const authenticationCookie = authenticationCookies[0];
        assert.equal(authenticationCookie.name, "token");
        assert.equal(authenticationCookie.httpOnly, true);
        assert.equal(authenticationCookie.sameSite, "Lax");
        assert.equal(authenticationCookie.path, "/");
        assert.equal(authenticationCookie.secure, false, "The test server uses HTTP.");
        assert.ok(authenticationCookie.expires > Date.now() / 1000);

        const dashboardStorage = await readBrowserStorage(page);
        assertNoOptionalBrowserStorage(dashboardStorage, roleCase.name);
        assert.deepEqual(
            [...externalRequestOrigins],
            [],
            `${roleCase.name}: page requests must stay on the SaludVital origin.`,
        );

        const logoutResponse = await context.request.post(`${baseUrl}/logout`, {
            maxRedirects: 0,
            headers: { Origin: baseUrl, Referer: page.url() },
        });
        assert.equal(logoutResponse.status(), 303);
        assert.equal(logoutResponse.headers().location, "/login");
        assert.deepEqual(
            await context.cookies(baseUrl),
            [],
            "Logout should clear the browser cookie.",
        );

        console.log(
            `PASS: ${roleCase.name} uses one protected auth cookie, no optional browser storage, and no third-party page requests.`,
        );
    } finally {
        await context.close();
    }
}

async function removeAuditAccounts() {
    const userIds = createdUsers.map(({ id }) => id);
    if (userIds.length > 0) {
        await AuthSession.destroy({ where: { user_id: userIds } });
        await Patient.destroy({ where: { user_id: userIds } });
        await Doctor.destroy({ where: { user_id: userIds } });
        await User.destroy({ where: { id: userIds } });
    }

    if (createdAuditSpecialty && createdSpecialty) {
        const stillUsed = await Doctor.count({ where: { specialty_id: createdSpecialty.id } });
        if (stillUsed === 0) await createdSpecialty.destroy();
    }
}

async function waitForServer(server) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
        if (server.exitCode !== null)
            throw new Error("The browser audit server stopped unexpectedly.");
        try {
            const response = await fetch(`${baseUrl}/login`, {
                signal: AbortSignal.timeout(3000),
            });
            if (response.ok) return;
        } catch {
            // Retry briefly while the local test server starts.
        }
        await delay(500);
    }
    throw new Error("The browser audit server did not become ready.");
}

let server;
let browser;

try {
    await createAuditAccounts();
    server = spawn(process.execPath, ["server.js"], {
        env: createServerEnvironment(),
        stdio: "ignore",
    });
    await waitForServer(server);
    browser = await chromium.launch({ headless: true });

    for (const roleCase of roleDashboards) {
        await verifyRoleSession(browser, roleCase);
    }
} finally {
    await browser?.close();
    server?.kill();
    await removeAuditAccounts();
    await database.close();
}
