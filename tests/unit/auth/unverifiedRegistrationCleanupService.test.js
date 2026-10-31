import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const transaction = { LOCK: { UPDATE: "UPDATE" } };
const modelNames = [
    "Appointment",
    "AppointmentHistory",
    "AuditLog",
    "ChatbotFlowVersion",
    "Doctor",
    "DoctorScheduleException",
    "EmailOutbox",
    "EmergencyContact",
    "Notification",
    "NotificationPreference",
    "PasswordResetToken",
    "Patient",
    "Rol",
    "User",
    "WhatsAppAppointmentRequest",
    "WhatsAppConversation",
    "WhatsAppVerification",
];

const models = Object.fromEntries(
    modelNames.map((name) => [
        name,
        {
            count: jest.fn(),
            destroy: jest.fn(),
            findAll: jest.fn(),
            findByPk: jest.fn(),
            findOne: jest.fn(),
        },
    ]),
);

jest.unstable_mockModule("../../../config/database.js", () => ({
    default: { transaction: jest.fn(async (callback) => callback(transaction)) },
}));

jest.unstable_mockModule("../../../src/models/associations.js", () => models);

const { cleanExpiredUnverifiedRegistrations } =
    await import("../../../src/modules/auth/services/unverifiedRegistrationCleanupService.js");

describe("Unverified registration cleanup service", () => {
    const now = new Date("2026-10-30T12:00:00.000Z");
    let patient;
    let user;

    beforeEach(() => {
        jest.clearAllMocks();

        patient = { id: 91, destroy: jest.fn() };
        user = {
            id: 42,
            role_id: 3,
            created_at: new Date(now.getTime() - 31 * 60 * 1000),
            email_verified_at: null,
            destroy: jest.fn(),
        };

        models.User.findAll.mockResolvedValue([{ id: user.id }]);
        models.User.findByPk.mockResolvedValue(user);
        models.Rol.findByPk.mockResolvedValue({ name: "Patient" });
        models.Patient.findOne.mockResolvedValue(patient);
        models.EmailOutbox.findAll.mockResolvedValue([
            { id: 101, event_type: "email_verification", status: "sent" },
        ]);
        models.EmailOutbox.destroy.mockResolvedValue(1);
        models.AuditLog.count.mockResolvedValue(0);

        for (const name of modelNames) models[name].count.mockResolvedValue(0);
    });

    test("deletes an expired unverified patient and its verification email job", async () => {
        await expect(
            cleanExpiredUnverifiedRegistrations({ now, retentionMinutes: 30 }),
        ).resolves.toEqual({ deletedCount: 1, examinedCount: 1, nextAfterUserId: 0 });

        expect(models.EmailOutbox.destroy).toHaveBeenCalledWith({
            where: { user_id: user.id, event_type: "email_verification" },
            transaction,
        });
        expect(patient.destroy).toHaveBeenCalledWith({ transaction });
        expect(user.destroy).toHaveBeenCalledWith({ transaction });
    });

    test("preserves a registration that has not reached its retention deadline", async () => {
        user.created_at = new Date(now.getTime() - 29 * 60 * 1000);

        await expect(
            cleanExpiredUnverifiedRegistrations({ now, retentionMinutes: 30 }),
        ).resolves.toEqual({ deletedCount: 0, examinedCount: 1, nextAfterUserId: 0 });

        expect(patient.destroy).not.toHaveBeenCalled();
        expect(user.destroy).not.toHaveBeenCalled();
    });

    test("preserves a verified account even when it appears in the stale candidate set", async () => {
        user.email_verified_at = new Date(now.getTime() - 1000);

        await cleanExpiredUnverifiedRegistrations({ now });

        expect(patient.destroy).not.toHaveBeenCalled();
        expect(user.destroy).not.toHaveBeenCalled();
    });

    test("preserves non-patient accounts", async () => {
        models.Rol.findByPk.mockResolvedValue({ name: "Doctor" });

        await cleanExpiredUnverifiedRegistrations({ now });

        expect(models.Patient.findOne).not.toHaveBeenCalled();
        expect(user.destroy).not.toHaveBeenCalled();
    });

    test("preserves accounts while verification email delivery is in progress", async () => {
        models.EmailOutbox.findAll.mockResolvedValue([
            { id: 101, event_type: "email_verification", status: "processing" },
        ]);

        await cleanExpiredUnverifiedRegistrations({ now });

        expect(models.EmailOutbox.destroy).not.toHaveBeenCalled();
        expect(patient.destroy).not.toHaveBeenCalled();
        expect(user.destroy).not.toHaveBeenCalled();
    });

    test("preserves patient profiles with dependent business records", async () => {
        models.Notification.count.mockResolvedValue(1);

        await cleanExpiredUnverifiedRegistrations({ now });

        expect(models.EmailOutbox.destroy).not.toHaveBeenCalled();
        expect(patient.destroy).not.toHaveBeenCalled();
        expect(user.destroy).not.toHaveBeenCalled();
    });

    test("preserves accounts referenced by audit history", async () => {
        models.AuditLog.count.mockResolvedValue(1);

        await cleanExpiredUnverifiedRegistrations({ now });

        expect(patient.destroy).not.toHaveBeenCalled();
        expect(user.destroy).not.toHaveBeenCalled();
    });

    test("rejects unsafe cleanup configuration", async () => {
        await expect(cleanExpiredUnverifiedRegistrations({ retentionMinutes: 29 })).rejects.toThrow(
            TypeError,
        );
        await expect(cleanExpiredUnverifiedRegistrations({ batchSize: 101 })).rejects.toThrow(
            TypeError,
        );
    });
});
