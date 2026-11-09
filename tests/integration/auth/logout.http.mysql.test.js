import bcrypt from "bcrypt";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "@jest/globals";
import request from "supertest";
import app from "../../../app.js";
import database from "../../../config/database.js";
import AuthSession from "../../../src/models/AuthSession.js";
import { Rol, User } from "../../../src/models/associations.js";
import { cleanupExpiredSessions } from "../../../src/modules/auth/services/sessionActivity.js";

if (process.env.NODE_ENV !== "test" || process.env.DB_NAME !== "saludvital_test") {
    throw new Error(
        "Logout HTTP integration tests require the dedicated saludvital_test database.",
    );
}

const password = "LogoutTest123!";
const roleCases = [
    { name: "Patient", dashboard: "/patient/dashboard" },
    { name: "Doctor", dashboard: "/doctor/dashboard" },
    { name: "Administrator", dashboard: "/admin/dashboard" },
];

function createUniqueEmail(roleName) {
    return `logout-${roleName.toLowerCase()}-${randomUUID()}@example.test`;
}

async function createVerifiedUser(roleName) {
    const role = await Rol.findOne({ where: { name: roleName }, attributes: ["id"] });

    if (!role) {
        throw new Error(`The ${roleName} role is missing from saludvital_test.`);
    }

    const email = createUniqueEmail(roleName);
    const user = await User.create({
        role_id: role.id,
        email,
        password_hash: await bcrypt.hash(password, 4),
        is_active: true,
        email_verified_at: new Date(),
    });

    return { user, email };
}

function getAuthenticationCookie(response) {
    const cookies = response.headers["set-cookie"] || [];
    const tokenCookie = cookies.find((cookie) => cookie.startsWith("token="));

    if (!tokenCookie) {
        throw new Error("The login response did not set the authentication cookie.");
    }

    return tokenCookie.split(";")[0];
}

describe("Logout HTTP integration with persisted sessions", () => {
    const createdUserIds = [];

    beforeAll(async () => {
        await database.authenticate();
    });

    afterEach(async () => {
        for (const userId of createdUserIds.splice(0)) {
            await AuthSession.destroy({ where: { user_id: userId } });
            await User.destroy({ where: { id: userId } });
        }
    });

    afterAll(async () => {
        await database.close();
    });

    test.each(roleCases)(
        "revokes a $name session before redirecting",
        async ({ name, dashboard }) => {
            const { user, email } = await createVerifiedUser(name);
            createdUserIds.push(user.id);

            const loginResponse = await request(app)
                .post("/login")
                .type("form")
                .send({ email, password });

            expect(loginResponse.status).toBe(303);
            expect(loginResponse.headers.location).toBe(dashboard);

            const authenticationCookie = getAuthenticationCookie(loginResponse);
            const activeSession = await AuthSession.findOne({ where: { user_id: user.id } });
            expect(activeSession).not.toBeNull();

            const logoutResponse = await request(app)
                .post("/logout")
                .set("Cookie", authenticationCookie);

            expect(logoutResponse.status).toBe(303);
            expect(logoutResponse.headers.location).toBe("/login");
            expect(await AuthSession.count({ where: { user_id: user.id } })).toBe(0);

            const replayResponse = await request(app)
                .get(dashboard)
                .set("Cookie", authenticationCookie);

            expect(replayResponse.status).toBe(303);
            expect(replayResponse.headers.location).toBe("/login");
            expect(await AuthSession.count({ where: { user_id: user.id } })).toBe(0);
        },
    );

    test.each([
        { label: "missing", cookie: null },
        { label: "invalid", cookie: "token=not-a-valid-jwt" },
    ])("clears a $label cookie and redirects safely", async ({ cookie }) => {
        const logoutRequest = request(app).post("/logout");
        if (cookie) logoutRequest.set("Cookie", cookie);

        const response = await logoutRequest;

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
        expect(response.headers["set-cookie"]).toEqual(
            expect.arrayContaining([expect.stringMatching(/^token=/)]),
        );
    });

    test("clears an inactive session cookie and blocks replay", async () => {
        const { user, email } = await createVerifiedUser("Patient");
        createdUserIds.push(user.id);

        const loginResponse = await request(app)
            .post("/login")
            .type("form")
            .send({ email, password });
        expect(loginResponse.status).toBe(303);
        const authenticationCookie = getAuthenticationCookie(loginResponse);

        await AuthSession.update(
            { last_activity_at: new Date(Date.now() - 181_000) },
            { where: { user_id: user.id } },
        );

        const logoutResponse = await request(app)
            .post("/logout")
            .set("Cookie", authenticationCookie);

        expect(logoutResponse.status).toBe(303);
        expect(logoutResponse.headers.location).toBe("/login");

        const replayResponse = await request(app)
            .get("/patient/dashboard")
            .set("Cookie", authenticationCookie);

        expect(replayResponse.status).toBe(303);
        expect(replayResponse.headers.location).toBe("/login");
    });

    test("does not refresh a session for notification polling but refreshes explicit activity", async () => {
        const { user, email } = await createVerifiedUser("Patient");
        createdUserIds.push(user.id);

        const loginResponse = await request(app)
            .post("/login")
            .type("form")
            .send({ email, password });
        const authenticationCookie = getAuthenticationCookie(loginResponse);
        const session = await AuthSession.findOne({ where: { user_id: user.id } });
        const priorActivityAt = new Date(Date.now() - 60_000);
        await session.update({ last_activity_at: priorActivityAt });

        const pollingResponses = await Promise.all(
            Array.from({ length: 2 }, () =>
                request(app)
                    .get("/api/patient/notifications/unread-count")
                    .set("Cookie", authenticationCookie),
            ),
        );
        expect(pollingResponses.map((response) => response.status)).toEqual([200, 200]);
        await session.reload();
        expect(session.last_activity_at.getTime()).toBe(priorActivityAt.getTime());

        const activityResponses = await Promise.all(
            Array.from({ length: 2 }, () =>
                request(app).post("/session/activity").set("Cookie", authenticationCookie),
            ),
        );
        expect(activityResponses.map((response) => response.status)).toEqual([204, 204]);
        await session.reload();
        expect(session.last_activity_at.getTime()).toBeGreaterThan(priorActivityAt.getTime());
    });

    test("cleans expired sessions in bounded, repeatable batches", async () => {
        const { user } = await createVerifiedUser("Patient");
        createdUserIds.push(user.id);
        const now = new Date();
        const expiredAt = new Date(now.getTime() - 10 * 60 * 1000);
        const activeAt = new Date(now.getTime() - 60 * 1000);
        const sessionRows = ["old-one", "old-two", "old-three", "active"].map((value) => ({
            session_id_hash: createHash("sha256").update(`${user.id}:${value}`).digest("hex"),
            user_id: user.id,
            last_activity_at: value === "active" ? activeAt : expiredAt,
        }));
        await AuthSession.bulkCreate(sessionRows);

        await expect(cleanupExpiredSessions({ batchSize: 2, now })).resolves.toBe(2);
        expect(await AuthSession.count({ where: { user_id: user.id } })).toBe(2);

        await expect(cleanupExpiredSessions({ batchSize: 2, now })).resolves.toBe(1);
        const remaining = await AuthSession.findAll({ where: { user_id: user.id } });
        expect(remaining).toHaveLength(1);
        expect(remaining[0].last_activity_at.getTime()).toBe(activeAt.getTime());
    });
});
