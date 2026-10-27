import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const notEqual = Symbol("notEqual");
const transaction = { LOCK: { UPDATE: "UPDATE" }, rolledBack: false };

jest.unstable_mockModule("sequelize", () => ({ Op: { ne: notEqual } }));
jest.unstable_mockModule("../../config/database.js", () => ({
    default: {
        transaction: jest.fn(async (callback) => {
            try {
                return await callback(transaction);
            } catch (error) {
                transaction.rolledBack = true;
                throw error;
            }
        }),
    },
}));
jest.unstable_mockModule("../../src/models/AuditLog.js", () => ({
    default: { create: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Doctor: {},
    EmailOutbox: { create: jest.fn() },
    Patient: {},
    Rol: {},
    User: { findByPk: jest.fn(), findOne: jest.fn() },
}));
jest.unstable_mockModule("../../src/modules/admin/services/adminProfileService.js", () => ({
    toAdminProfile: jest.fn((user) => ({
        displayName: user.display_name,
        email: user.email,
        phone: user.phone,
        role: user.rol.name,
    })),
}));

const database = (await import("../../config/database.js")).default;
const AuditLog = (await import("../../src/models/AuditLog.js")).default;
const { EmailOutbox, User } = await import("../../src/models/associations.js");
const { toAdminProfile } = await import("../../src/modules/admin/services/adminProfileService.js");
const { updateAdminProfilePersonalInformation } =
    await import("../../src/modules/admin/services/adminProfileEditingService.js");

function createAdministrator() {
    const user = {
        id: 7,
        role_id: 1,
        display_name: "Laura Méndez",
        email: "laura@example.com",
        phone: null,
        is_active: true,
        rol: { name: "Administrator" },
        update: null,
    };
    user.update = jest.fn(async (updates) => Object.assign(user, updates));
    return user;
}

describe("administrator personal information updates", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        transaction.rolledBack = false;
        User.findByPk.mockResolvedValue(createAdministrator());
        User.findOne.mockResolvedValue(null);
        EmailOutbox.create.mockResolvedValue({ id: 1 });
        AuditLog.create.mockResolvedValue({ id: 3 });
        toAdminProfile.mockClear();
    });

    test("updates personal fields and audits field names without their values", async () => {
        const user = createAdministrator();
        User.findByPk.mockResolvedValue(user);

        const result = await updateAdminProfilePersonalInformation("7", {
            displayName: "Laura Torres",
            email: "laura@example.com",
            phone: "+573001234567",
        });

        expect(user.update).toHaveBeenCalledWith(
            { display_name: "Laura Torres", phone: "+573001234567" },
            { transaction },
        );
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                actor_user_id: 7,
                action: "AdminUserProfileUpdated",
                target_type: "User",
                target_id: "7",
                changes: {
                    updatedFields: ["display_name", "phone"],
                    emailVerificationRequired: false,
                },
            }),
            { transaction },
        );
        expect(JSON.stringify(AuditLog.create.mock.calls)).not.toContain("+573001234567");
        expect(EmailOutbox.create).not.toHaveBeenCalled();
        expect(result.profile.phone).toBe("+573001234567");
    });

    test("resets email verification and queues the existing verification message", async () => {
        const user = createAdministrator();
        User.findByPk.mockResolvedValue(user);

        const result = await updateAdminProfilePersonalInformation(7, {
            displayName: "Laura Méndez",
            email: "laura.new@example.com",
            phone: "",
        });

        expect(user.update).toHaveBeenCalledWith(
            expect.objectContaining({
                email: "laura.new@example.com",
                email_verified_at: null,
                email_verification_token_hash: null,
                email_verification_expires_at: null,
            }),
            { transaction },
        );
        expect(EmailOutbox.create).toHaveBeenCalledWith(
            expect.objectContaining({
                user_id: 7,
                event_type: "email_verification",
                status: "pending",
            }),
            { transaction },
        );
        expect(result.emailVerificationRequired).toBe(true);
    });

    test("rejects duplicate email, invalid values, and protected fields", async () => {
        User.findOne.mockResolvedValueOnce({ id: 8 });
        await expect(
            updateAdminProfilePersonalInformation(7, {
                displayName: "Laura Méndez",
                email: "taken@example.com",
                phone: "3001234567",
            }),
        ).rejects.toMatchObject({ statusCode: 409 });

        await expect(
            updateAdminProfilePersonalInformation(7, {
                displayName: "Laura Méndez",
                email: "laura@example.com",
                phone: "not a phone",
            }),
        ).rejects.toMatchObject({ statusCode: 400 });

        await expect(
            updateAdminProfilePersonalInformation(7, {
                displayName: "Laura Méndez",
                email: "laura@example.com",
                phone: "",
                roleId: 1,
            }),
        ).rejects.toMatchObject({ statusCode: 400 });
    });

    test("does not update non-administrator accounts", async () => {
        User.findByPk.mockResolvedValue({ is_active: true, rol: { name: "Doctor" } });

        await expect(
            updateAdminProfilePersonalInformation(7, {
                displayName: "Doctor Name",
                email: "doctor@example.com",
                phone: "3001234567",
            }),
        ).rejects.toMatchObject({ statusCode: 404 });
    });

    test("does not create an audit event when no values changed", async () => {
        const user = createAdministrator();
        User.findByPk.mockResolvedValue(user);

        const result = await updateAdminProfilePersonalInformation(7, {
            displayName: "Laura Méndez",
            email: "laura@example.com",
            phone: "",
        });

        expect(user.update).not.toHaveBeenCalled();
        expect(AuditLog.create).not.toHaveBeenCalled();
        expect(result.message).toBe("No se detectaron cambios en tu perfil.");
    });

    test("does not write an already displayed name inherited from a linked profile", async () => {
        const user = createAdministrator();
        user.display_name = null;
        user.patient = { first_name: "Laura", last_name: "Méndez" };
        User.findByPk.mockResolvedValue(user);

        const result = await updateAdminProfilePersonalInformation(7, {
            displayName: "Laura Méndez",
            email: "laura@example.com",
            phone: "",
        });

        expect(user.update).not.toHaveBeenCalled();
        expect(AuditLog.create).not.toHaveBeenCalled();
        expect(result.message).toBe("No se detectaron cambios en tu perfil.");
    });

    test("propagates outbox failures so the profile transaction rolls back", async () => {
        EmailOutbox.create.mockRejectedValue(new Error("Outbox unavailable"));

        await expect(
            updateAdminProfilePersonalInformation(7, {
                displayName: "Laura Méndez",
                email: "laura.new@example.com",
                phone: "3001234567",
            }),
        ).rejects.toThrow("Outbox unavailable");

        expect(transaction.rolledBack).toBe(true);
        expect(AuditLog.create).not.toHaveBeenCalled();
        expect(database.transaction).toHaveBeenCalledTimes(1);
    });
});
