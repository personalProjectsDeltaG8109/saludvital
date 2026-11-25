import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const transaction = { LOCK: { UPDATE: "UPDATE" } };

jest.unstable_mockModule("sequelize", () => ({ Op: { in: Symbol("in") } }));
jest.unstable_mockModule("../../config/database.js", () => ({
    default: { transaction: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    AccountInvitation: { create: jest.fn(), findAll: jest.fn(), findByPk: jest.fn() },
    AuditLog: { create: jest.fn() },
    EmailOutbox: {
        create: jest.fn(),
        destroy: jest.fn(),
        findAll: jest.fn(),
        findOne: jest.fn(),
        update: jest.fn(),
    },
    Rol: { findOne: jest.fn() },
    User: { create: jest.fn(), destroy: jest.fn(), findByPk: jest.fn(), findOne: jest.fn() },
}));

const database = (await import("../../config/database.js")).default;
const { AccountInvitation, AuditLog, EmailOutbox, Rol, User } =
    await import("../../src/models/associations.js");
const { createAdminAccountInvitation } =
    await import("../../src/modules/admin/services/adminAccountInvitationService.js");

describe("Admin account invitations", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        database.transaction.mockImplementation((callback) => callback(transaction));
        User.findOne.mockResolvedValue(null);
        User.findByPk.mockResolvedValue({ id: 9, email: "admin@example.com" });
        User.create.mockResolvedValue({ id: 42 });
        Rol.findOne.mockImplementation(({ where }) =>
            Promise.resolve({ id: where.name === "Administrator" ? 1 : 2, name: where.name }),
        );
        AccountInvitation.create.mockResolvedValue({ id: 71 });
        EmailOutbox.create.mockResolvedValue({ id: 82 });
        AuditLog.create.mockResolvedValue({ id: 93 });
    });

    test.each([
        ["patient", "Patient", 2],
        ["administrator", "Administrator", 1],
    ])("assigns only the server-selected %s role", async (accountType, roleName, roleId) => {
        const result = await createAdminAccountInvitation(9, {
            accountType,
            displayName: "Ana Torres",
            email: "ANA.TORRES@example.com",
        });

        expect(User.create).toHaveBeenCalledWith(
            expect.objectContaining({
                role_id: roleId,
                email: "ana.torres@example.com",
                display_name: "Ana Torres",
                is_active: false,
                password_hash: expect.any(String),
            }),
            { transaction },
        );
        expect(AccountInvitation.create).toHaveBeenCalledWith(
            { user_id: 42, invited_by_user_id: 9 },
            { transaction },
        );
        expect(EmailOutbox.create).toHaveBeenCalledWith(
            expect.objectContaining({
                user_id: 42,
                event_type: "account_invitation",
                status: "pending",
            }),
            { transaction },
        );
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "AdminAccountInvitationCreated",
                target_type: "AccountInvitation",
                target_description: `${roleName}: ana.torres@example.com`,
            }),
            { transaction },
        );
        expect(result.invitation).toMatchObject({
            accountType,
            email: "ana.torres@example.com",
            role: roleName === "Patient" ? "Paciente" : "Administrador",
            status: "pending",
        });
    });

    test("does not create an account when the requested role or email is invalid", async () => {
        await expect(
            createAdminAccountInvitation(9, {
                accountType: "doctor",
                displayName: "Ana Torres",
                email: "ana@example.com",
            }),
        ).rejects.toMatchObject({ statusCode: 400 });
        await expect(
            createAdminAccountInvitation(9, {
                accountType: "patient",
                displayName: "Ana Torres",
                email: "invalid-email",
            }),
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(User.create).not.toHaveBeenCalled();
    });

    test("rejects an email that already belongs to an account", async () => {
        User.findOne.mockResolvedValue({ id: 7 });

        await expect(
            createAdminAccountInvitation(9, {
                accountType: "patient",
                displayName: "Ana Torres",
                email: "ana@example.com",
            }),
        ).rejects.toMatchObject({ statusCode: 409 });
        expect(User.create).not.toHaveBeenCalled();
        expect(EmailOutbox.create).not.toHaveBeenCalled();
    });
});
