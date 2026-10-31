import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "@jest/globals";
import app from "../../../app.js";
import database from "../../../config/database.js";
import { Rol, User } from "../../../src/models/associations.js";

if (process.env.NODE_ENV !== "test" || process.env.DB_NAME !== "saludvital_test") {
    throw new Error("Login HTTP integration tests require the dedicated saludvital_test database.");
}

describe("Login lockout HTTP behavior with real MySQL", () => {
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

    test("repeated successful logins do not consume the failed-attempt rate limit", async () => {
        const email = `login-http-${randomUUID()}@example.test`;
        createdEmails.push(email);
        const password = "CorrectPassword123!";
        const user = await User.create({
            role_id: patientRole.id,
            email,
            password_hash: await bcrypt.hash(password, 4),
            is_active: true,
            email_verified_at: new Date(),
            failed_login_attempts: 3,
        });

        for (let attempt = 0; attempt < 6; attempt += 1) {
            const response = await request(app)
                .post("/login")
                .type("form")
                .send({ email, password });

            expect(response.status).toBe(303);
            expect(response.headers.location).toBe("/patient/dashboard");
        }

        const storedUser = await User.findByPk(user.id);
        expect(storedUser.failed_login_attempts).toBe(0);
        expect(storedUser.login_locked_until).toBeNull();
    });

    test("unknown accounts and incorrect passwords share a generic response", async () => {
        const email = `login-http-${randomUUID()}@example.test`;
        createdEmails.push(email);
        await User.create({
            role_id: patientRole.id,
            email,
            password_hash: await bcrypt.hash("CorrectPassword123!", 4),
            is_active: true,
            email_verified_at: new Date(),
        });

        const response = await request(app)
            .post("/login")
            .type("form")
            .send({ email, password: "WrongPassword123!" });
        const unknownAccountResponse = await request(app)
            .post("/login")
            .type("form")
            .send({ email: `missing-${randomUUID()}@example.test`, password: "WrongPassword123!" });

        expect(response.status).toBe(401);
        expect(response.text).toContain("Inválido el correo electrónico o la contraseña.");
        expect(response.text).not.toContain(email);
        expect(unknownAccountResponse.status).toBe(401);
        expect(unknownAccountResponse.text).toContain(
            "Inválido el correo electrónico o la contraseña.",
        );
    });
});
