import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("bcrypt", () => ({ default: { hash: jest.fn() } }));
jest.unstable_mockModule("sequelize", () => ({
    Op: { in: Symbol("in"), or: Symbol("or") },
}));
jest.unstable_mockModule("../../config/database.js", () => ({
    default: { transaction: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    AccountInvitation: { create: jest.fn(), findOne: jest.fn() },
    AuditLog: { create: jest.fn() },
    Doctor: { create: jest.fn() },
    EmailOutbox: { create: jest.fn() },
    Rol: { findOne: jest.fn() },
    Specialities: { findOne: jest.fn() },
    User: { create: jest.fn(), findByPk: jest.fn(), findOne: jest.fn() },
}));

const transaction = { LOCK: { UPDATE: "UPDATE" } };
const bcrypt = (await import("bcrypt")).default;
const database = (await import("../../config/database.js")).default;
const { AccountInvitation, AuditLog, Doctor, EmailOutbox, Rol, Specialities, User } =
    await import("../../src/models/associations.js");
const { createAdminAccountInvitation } =
    await import("../../src/modules/admin/services/adminAccountInvitationService.js");

describe("Admin doctor invitation", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        database.transaction.mockImplementation(async (callback) => callback(transaction));
        bcrypt.hash.mockResolvedValue("hashed-one-time-secret");
        User.findOne.mockResolvedValue(null);
        Rol.findOne.mockResolvedValue({ id: 3, name: "Doctor" });
        Specialities.findOne.mockResolvedValue({ id: 9, is_active: true });
        User.create.mockResolvedValue({ id: 42 });
        Doctor.create.mockResolvedValue({ id: 12 });
        AccountInvitation.create.mockResolvedValue({ id: 71 });
        EmailOutbox.create.mockResolvedValue({ id: 18 });
        User.findByPk.mockResolvedValue({ id: 5, email: "admin@example.com" });
        AuditLog.create.mockResolvedValue({ id: 2 });
    });

    test("creates an inactive doctor invitation without accepting a password from the admin", async () => {
        const result = await createAdminAccountInvitation(5, {
            accountType: "doctor",
            email: "doctor@example.com",
            specialtyId: 9,
        });

        expect(result).toMatchObject({
            invitation: {
                email: "doctor@example.com",
                accountType: "doctor",
                specialtyId: 9,
                status: "pending",
            },
        });
        expect(User.create).toHaveBeenCalledWith(
            expect.objectContaining({ is_active: false, password_hash: "hashed-one-time-secret" }),
            { transaction },
        );
        expect(Doctor.create).toHaveBeenCalledWith(
            { user_id: 42, specialty_id: 9, profile_review_status: "invited" },
            { transaction },
        );
        expect(EmailOutbox.create).toHaveBeenCalledWith(
            expect.objectContaining({ event_type: "account_invitation", status: "pending" }),
            { transaction },
        );
        expect(User.create.mock.calls[0][0]).not.toHaveProperty("password");
    });

    test("rejects an unavailable specialty before creating the account", async () => {
        Specialities.findOne.mockResolvedValue(null);

        await expect(
            createAdminAccountInvitation(5, {
                accountType: "doctor",
                email: "doctor@example.com",
                specialtyId: 9,
            }),
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(User.create).not.toHaveBeenCalled();
        expect(Doctor.create).not.toHaveBeenCalled();
    });
});
