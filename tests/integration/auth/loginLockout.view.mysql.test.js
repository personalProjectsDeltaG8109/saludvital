import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "@jest/globals";
import app from "../../../app.js";
import database from "../../../config/database.js";
import { Rol, User } from "../../../src/models/associations.js";

if (process.env.NODE_ENV !== "test" || process.env.DB_NAME !== "saludvital_test") {
    throw new Error("Login lockout view tests require the dedicated saludvital_test database.");
}

describe("Login lockout form behavior with real MySQL", () => {
    const createdEmails = [];
    let patientRole;

    beforeAll(async () => {
        await database.authenticate();
        patientRole = await Rol.findOne({ where: { name: "Patient" }, attributes: ["id"] });

        if (!patientRole) {
            throw new Error('The "Patient" role is missing from saludvital_test.');
        }
    });

    afterEach(async () => {
        for (const email of createdEmails.splice(0)) {
            await User.destroy({ where: { email } });
        }
    });

    afterAll(async () => {
        await database.close();
    });

    test("disables login controls after the fifth failed password and returns the lock expiry", async () => {
        const email = `login-lock-view-${randomUUID()}@example.test`;
        createdEmails.push(email);
        await User.create({
            role_id: patientRole.id,
            email,
            password_hash: await bcrypt.hash("CorrectPassword123!", 4),
            is_active: true,
            email_verified_at: new Date(),
        });

        for (let attempt = 0; attempt < 4; attempt += 1) {
            const response = await request(app)
                .post("/login")
                .type("form")
                .send({ email, password: "WrongPassword123!" });
            expect(response.status).toBe(401);
        }

        const response = await request(app)
            .post("/login")
            .type("form")
            .send({ email, password: "WrongPassword123!" });
        const storedUser = await User.findOne({ where: { email } });

        expect(response.status).toBe(429);
        expect(response.headers["cache-control"]).toContain("no-store");
        expect(response.text).toContain("Has realizado demasiados intentos");
        expect(response.text).toContain('id="email"');
        expect(response.text).toContain('id="password"');
        expect(response.text).toContain("data-login-lock-countdown");
        expect(response.text).toMatch(/<input[^>]*id="email"[^>]*disabled/);
        expect(response.text).toMatch(/<input[^>]*id="password"[^>]*disabled/);
        expect(response.text).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
        expect(response.text).not.toContain(email);
        expect(storedUser.login_locked_until.getTime()).toBeGreaterThan(Date.now());
    });
});
