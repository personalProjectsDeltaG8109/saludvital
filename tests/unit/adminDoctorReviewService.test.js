import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("sequelize", () => ({ Op: { in: Symbol("in") } }));
jest.unstable_mockModule("../../config/database.js", () => ({
    default: { transaction: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    AccountInvitation: { findOne: jest.fn() },
    AuditLog: { create: jest.fn() },
    Doctor: { findByPk: jest.fn() },
    EmailOutbox: { create: jest.fn(), findOne: jest.fn(), update: jest.fn() },
    Rol: { findByPk: jest.fn() },
    User: { findByPk: jest.fn() },
}));

const transaction = { LOCK: { UPDATE: "UPDATE" } };
const database = (await import("../../config/database.js")).default;
const { AccountInvitation, AuditLog, Doctor, EmailOutbox, Rol, User } =
    await import("../../src/models/associations.js");
const { reviewAdminDoctorProfile } =
    await import("../../src/modules/admin/services/adminDoctorReviewService.js");

describe("Admin doctor profile review", () => {
    let doctor;
    let user;

    beforeEach(() => {
        jest.clearAllMocks();
        database.transaction.mockImplementation(async (callback) => callback(transaction));
        doctor = {
            id: 12,
            user_id: 42,
            first_name: "Ana",
            last_name: "Torres",
            document_type: "CC",
            document_number: "123456789",
            professional_registration_number: "RM-12345",
            profile_review_status: "pending",
            update: jest.fn().mockResolvedValue(undefined),
        };
        user = {
            id: 42,
            email: "doctor@example.com",
            role_id: 3,
            email_verified_at: new Date("2026-10-20T12:00:00.000Z"),
            is_active: false,
            update: jest.fn().mockResolvedValue(undefined),
        };
        doctor.user = user;
        Doctor.findByPk.mockResolvedValue(doctor);
        Rol.findByPk.mockResolvedValue({ name: "Doctor" });
        User.findByPk.mockResolvedValue({ id: 5, email: "admin@example.com" });
        AuditLog.create.mockResolvedValue({ id: 1 });
    });

    test("approves a complete verified profile and activates it in one transaction", async () => {
        await expect(
            reviewAdminDoctorProfile(5, 12, { decision: "approve" }),
        ).resolves.toMatchObject({
            status: "approved",
            message: "Perfil aprobado. La cuenta del médico ya está activa.",
        });

        expect(doctor.update).toHaveBeenCalledWith(
            { profile_review_status: "approved", profile_review_note: null },
            { transaction },
        );
        expect(user.update).toHaveBeenCalledWith({ is_active: true }, { transaction });
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({ action: "AdminDoctorProfileApproved" }),
            { transaction },
        );
    });

    test("rejects approval when required profile information is missing", async () => {
        doctor.document_number = null;

        await expect(
            reviewAdminDoctorProfile(5, 12, { decision: "approve" }),
        ).rejects.toMatchObject({
            statusCode: 409,
        });

        expect(doctor.update).not.toHaveBeenCalled();
        expect(user.update).not.toHaveBeenCalled();
    });

    test("requests corrections and queues a fresh invitation without activating the account", async () => {
        const invitation = { update: jest.fn().mockResolvedValue(undefined) };
        EmailOutbox.findOne.mockResolvedValueOnce(null);
        AccountInvitation.findOne.mockResolvedValue(invitation);
        EmailOutbox.update.mockResolvedValue([0]);
        EmailOutbox.create.mockResolvedValue({ id: 2 });

        await expect(
            reviewAdminDoctorProfile(5, 12, {
                decision: "request_changes",
                note: "Revisa el número de tu tarjeta profesional.",
            }),
        ).resolves.toMatchObject({ status: "changes_requested" });

        expect(doctor.update).toHaveBeenCalledWith(
            expect.objectContaining({
                profile_review_status: "changes_requested",
                profile_review_note: "Revisa el número de tu tarjeta profesional.",
            }),
            { transaction },
        );
        expect(user.update).toHaveBeenCalledWith({ is_active: false }, { transaction });
        expect(invitation.update).toHaveBeenCalledWith(
            expect.objectContaining({ accepted_at: null, token_hash: null }),
            { transaction },
        );
        expect(EmailOutbox.create).toHaveBeenCalledWith(
            expect.objectContaining({ event_type: "account_invitation", status: "pending" }),
            { transaction },
        );
    });
});
