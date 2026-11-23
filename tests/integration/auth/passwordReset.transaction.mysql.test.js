import bcrypt from "bcrypt";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from "@jest/globals";
import request from "supertest";
import app from "../../../app.js";
import database from "../../../config/database.js";
import AuthSession from "../../../src/models/AuthSession.js";
import { PasswordResetToken, Rol, User } from "../../../src/models/associations.js";
import { resetPassword } from "../../../src/modules/auth/services/passwordResetService.js";

if (process.env.NODE_ENV !== "test" || process.env.DB_NAME !== "saludvital_test") {
    throw new Error(
        "Password reset transaction tests require the dedicated saludvital_test database.",
    );
}

const currentPassword = "OldPassword123!";
const newPassword = "NewPassword123!";

function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

function createAuthenticationCookie(response) {
    const tokenCookie = (response.headers["set-cookie"] || []).find((cookie) =>
        cookie.startsWith("token="),
    );

    if (!tokenCookie) {
        throw new Error("The login response did not set the authentication cookie.");
    }

    return tokenCookie.split(";")[0];
}

describe("Password reset transaction with real MySQL", () => {
    const createdUserIds = [];
    let patientRole;

    beforeAll(async () => {
        await database.authenticate();
        patientRole = await Rol.findOne({ where: { name: "Patient" }, attributes: ["id"] });

        if (!patientRole) {
            throw new Error('The "Patient" role is missing from saludvital_test.');
        }
    });

    afterEach(async () => {
        for (const userId of createdUserIds.splice(0)) {
            await AuthSession.destroy({ where: { user_id: userId } });
            await PasswordResetToken.destroy({ where: { user_id: userId } });
            await User.destroy({ where: { id: userId } });
        }
    });

    afterAll(async () => {
        await database.close();
    });

    async function createResetAccount() {
        const email = `password-reset-${randomUUID().replaceAll("-", "")}@example.test`;
        const user = await User.create({
            role_id: patientRole.id,
            email,
            password_hash: await bcrypt.hash(currentPassword, 4),
            is_active: true,
            email_verified_at: new Date(),
        });
        const token = randomBytes(32).toString("hex");

        createdUserIds.push(user.id);
        await PasswordResetToken.create({
            user_id: user.id,
            token_hash: hashToken(token),
            expires_at: new Date(Date.now() + 10 * 60 * 1000),
            used_at: null,
            created_at: new Date(),
        });

        return { user, email, token };
    }

    test("rolls back the password and reset token when session deletion fails", async () => {
        const { user, token } = await createResetAccount();
        const originalPasswordHash = user.password_hash;
        const sessionIdHash = hashToken(randomUUID());

        await AuthSession.create({
            session_id_hash: sessionIdHash,
            user_id: user.id,
            last_activity_at: new Date(),
        });

        const destroySpy = jest
            .spyOn(AuthSession, "destroy")
            .mockRejectedValue(new Error("Session storage unavailable"));

        try {
            await expect(resetPassword(token, newPassword, newPassword)).rejects.toThrow(
                "Session storage unavailable",
            );
        } finally {
            destroySpy.mockRestore();
        }

        await user.reload();
        const resetToken = await PasswordResetToken.findOne({
            where: { user_id: user.id },
        });

        expect(user.password_hash).toBe(originalPasswordHash);
        expect(resetToken.used_at).toBeNull();
        expect(await AuthSession.count({ where: { user_id: user.id } })).toBe(1);
    });

    test("removes old sessions and blocks the old cookie after a successful reset", async () => {
        const { user, email, token } = await createResetAccount();
        const loginResponse = await request(app)
            .post("/login")
            .type("form")
            .send({ email, password: currentPassword });

        expect(loginResponse.status).toBe(303);
        const authenticationCookie = createAuthenticationCookie(loginResponse);
        expect(await AuthSession.count({ where: { user_id: user.id } })).toBe(1);

        await expect(resetPassword(token, newPassword, newPassword)).resolves.toEqual({
            reset: true,
        });

        expect(await AuthSession.count({ where: { user_id: user.id } })).toBe(0);
        await expect(resetPassword(token, newPassword, newPassword)).resolves.toEqual({
            reset: false,
            reason: "invalid_or_expired",
        });

        const replayResponse = await request(app)
            .get("/patient/dashboard")
            .set("Cookie", authenticationCookie);

        expect(replayResponse.status).toBe(303);
        expect(replayResponse.headers.location).toBe("/login");
    });
});
