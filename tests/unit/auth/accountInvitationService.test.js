import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const transaction = { LOCK: { UPDATE: "UPDATE" } };

jest.unstable_mockModule("sequelize", () => ({ Op: { gt: Symbol("gt") } }));
jest.unstable_mockModule("../../../config/database.js", () => ({
    default: { transaction: jest.fn() },
}));
jest.unstable_mockModule("../../../src/models/associations.js", () => ({
    AccountInvitation: { findOne: jest.fn() },
    AuditLog: { create: jest.fn() },
    Patient: { create: jest.fn(), findOne: jest.fn() },
    PatientConsent: { create: jest.fn() },
    Rol: {},
    User: {},
}));
jest.unstable_mockModule("../../../src/modules/auth/services/registrationService.js", () => {
    class RegistrationError extends Error {
        constructor(message, statusCode = 400) {
            super(message);
            this.statusCode = statusCode;
        }
    }
    return {
        RegistrationError,
        validatePatientRegistration: jest.fn(() => ({
            firstName: "Ana",
            lastName: "Torres",
            location: { department: "Caldas", municipality: "Manizales" },
        })),
    };
});

const database = (await import("../../../config/database.js")).default;
const { AccountInvitation, AuditLog, Patient, PatientConsent } =
    await import("../../../src/models/associations.js");
const { completeAccountInvitation, getAccountInvitationByToken } =
    await import("../../../src/modules/auth/services/accountInvitationService.js");

describe("Account invitation activation", () => {
    const token = "a".repeat(64);
    let invitation;
    let user;

    beforeEach(() => {
        jest.clearAllMocks();
        database.transaction.mockImplementation((callback) => callback(transaction));
        user = {
            id: 42,
            email: "ana@example.com",
            display_name: "Ana Torres",
            is_active: false,
            email_verified_at: null,
            rol: { id: 2, name: "Patient" },
            update: jest.fn().mockResolvedValue(undefined),
        };
        invitation = {
            id: 71,
            user_id: user.id,
            user,
            update: jest.fn().mockResolvedValue(undefined),
        };
        AccountInvitation.findOne.mockResolvedValue(invitation);
        Patient.findOne.mockResolvedValue(null);
        Patient.create.mockResolvedValue({ id: 83 });
        PatientConsent.create.mockResolvedValue({ id: 94 });
        AuditLog.create.mockResolvedValue({ id: 105 });
    });

    test("exposes only safe details for a valid activation link", async () => {
        await expect(getAccountInvitationByToken(token)).resolves.toMatchObject({
            email: "ana@example.com",
            role: "Patient",
            accountType: "patient",
        });
        await expect(getAccountInvitationByToken("bad-token")).resolves.toBeNull();
    });

    test("does not create a patient before personal consent is accepted", async () => {
        await expect(
            completeAccountInvitation(token, {
                password: "Adminpass1!",
                password_confirmation: "Adminpass1!",
            }),
        ).rejects.toThrow("Debes autorizar el tratamiento");

        expect(database.transaction).not.toHaveBeenCalled();
        expect(Patient.create).not.toHaveBeenCalled();
        expect(PatientConsent.create).not.toHaveBeenCalled();
    });

    test("creates the patient profile and activates the account after consent", async () => {
        const data = {
            first_name: "Ana",
            last_name: "Torres",
            phone: "3001234567",
            date_of_birth: "1990-01-01",
            document_type: "CC",
            document_number: "1234567890",
            department: "17",
            municipality: "17001",
            health_data_consent: "accepted",
            password: "Adminpass1!",
            password_confirmation: "Adminpass1!",
        };

        await expect(completeAccountInvitation(token, data)).resolves.toMatchObject({
            role: "Patient",
            email: "ana@example.com",
            displayName: "Ana Torres",
        });

        expect(PatientConsent.create).toHaveBeenCalledWith(
            expect.objectContaining({
                user_id: user.id,
                consent_scope: "personal_and_sensitive_health_data",
                notice_version: "1.1",
                accepted_at: expect.any(Date),
            }),
            { transaction },
        );
        expect(Patient.create).toHaveBeenCalledWith(
            expect.objectContaining({
                user_id: user.id,
                first_name: "Ana",
                last_name: "Torres",
                department: "Caldas",
                municipality: "Manizales",
            }),
            { transaction },
        );
        expect(user.update).toHaveBeenCalledWith(
            expect.objectContaining({ is_active: true, email_verified_at: expect.any(Date) }),
            { transaction },
        );
        expect(invitation.update).toHaveBeenCalledWith(
            expect.objectContaining({ accepted_at: expect.any(Date), token_hash: null }),
            { transaction },
        );
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({ action: "AccountInvitationAccepted" }),
            { transaction },
        );
    });

    test("activates an administrator invitation without creating a patient profile", async () => {
        user.rol = { id: 1, name: "Administrator" };

        await expect(
            completeAccountInvitation(token, {
                display_name: "Ana Torres",
                password: "Adminpass1!",
                password_confirmation: "Adminpass1!",
            }),
        ).resolves.toMatchObject({ role: "Administrator", displayName: "Ana Torres" });

        expect(user.update).toHaveBeenCalledWith(
            expect.objectContaining({ display_name: "Ana Torres", is_active: true }),
            { transaction },
        );
        expect(Patient.create).not.toHaveBeenCalled();
        expect(PatientConsent.create).not.toHaveBeenCalled();
    });
});
