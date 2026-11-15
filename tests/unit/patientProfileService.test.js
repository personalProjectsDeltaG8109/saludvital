import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const transaction = { LOCK: { UPDATE: "UPDATE" } };

jest.unstable_mockModule("../../config/database.js", () => ({
    default: {
        transaction: jest.fn(async (callback) => callback(transaction)),
    },
}));
jest.unstable_mockModule("../../src/models/EmergencyContact.js", () => ({
    default: { findOne: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: { count: jest.fn() },
    Patient: { findOne: jest.fn() },
    User: { findByPk: jest.fn() },
}));
jest.unstable_mockModule("../../src/modules/auth/services/emailChangeService.js", () => ({
    isEmailUnavailable: jest.fn(),
    requestEmailChange: jest.fn(),
}));
jest.unstable_mockModule("../../src/shared/services/colombiaLocationService.js", () => ({
    resolveLocation: jest.fn(() => ({ department: "Risaralda", municipality: "Pereira" })),
}));

const EmergencyContact = (await import("../../src/models/EmergencyContact.js")).default;
const { Appointment, Patient, User } = await import("../../src/models/associations.js");
const { isEmailUnavailable, requestEmailChange } =
    await import("../../src/modules/auth/services/emailChangeService.js");
const { getPatientProfile, updatePatientProfile } =
    await import("../../src/modules/patient/services/profileService.js");

describe("patient profile email changes", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        isEmailUnavailable.mockResolvedValue(false);
        requestEmailChange.mockImplementation(async (user, email) => {
            user.pending_email = email;
        });
        Patient.findOne.mockResolvedValue({
            id: 18,
            update: jest.fn().mockResolvedValue(undefined),
        });
        User.findByPk.mockResolvedValue({
            id: 7,
            email: "current@example.com",
            email_verified_at: new Date("2026-10-01T12:00:00.000Z"),
            pending_email: null,
            update: jest.fn().mockResolvedValue(undefined),
        });
        EmergencyContact.findOne.mockResolvedValue(null);
        Appointment.count.mockResolvedValue(0);
    });

    test("keeps the current verified email while requesting confirmation of its replacement", async () => {
        const user = {
            id: 7,
            email: "current@example.com",
            email_verified_at: new Date("2026-10-01T12:00:00.000Z"),
            pending_email: null,
            update: jest.fn().mockResolvedValue(undefined),
        };
        User.findByPk.mockResolvedValue(user);

        const result = await updatePatientProfile(7, {
            personal: {
                first_name: "Laura",
                last_name: "Mendez",
                phone: "3001234567",
                email: "replacement@example.com",
                department: "66",
                municipality: "66001",
                address: "Calle 1",
            },
            medical: {},
            emergency: {},
        });

        expect(isEmailUnavailable).toHaveBeenCalledWith("replacement@example.com", 7, transaction);
        expect(requestEmailChange).toHaveBeenCalledWith(
            user,
            "replacement@example.com",
            transaction,
        );
        expect(user.email).toBe("current@example.com");
        expect(result).toEqual({
            emailChanged: true,
            email: "current@example.com",
            pendingEmail: "replacement@example.com",
        });
    });
});

describe("patient profile emergency contact access", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Appointment.count.mockResolvedValue(0);
    });

    test("loads the emergency contact only for the authenticated patient's profile", async () => {
        const patient = {
            id: 18,
            user_id: 7,
            created_at: new Date().toISOString(),
            get: jest.fn(() => ({ id: 18, user_id: 7 })),
        };
        const emergencyContact = {
            get: jest.fn(() => ({ first_name: "Contacto", phone: "3001234567" })),
        };
        Patient.findOne.mockResolvedValue(patient);
        EmergencyContact.findOne.mockResolvedValue(emergencyContact);

        const profile = await getPatientProfile(7);

        expect(Patient.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ where: { user_id: 7 } }),
        );
        expect(EmergencyContact.findOne).toHaveBeenCalledWith({
            where: { patient_id: 18 },
            order: [["id", "ASC"]],
        });
        expect(profile.emergencyContact).toEqual({
            first_name: "Contacto",
            phone: "3001234567",
        });
    });

    test("does not look up an emergency contact when the patient profile is missing", async () => {
        Patient.findOne.mockResolvedValue(null);

        await expect(getPatientProfile(999)).rejects.toMatchObject({ status: 404 });
        expect(EmergencyContact.findOne).not.toHaveBeenCalled();
    });
});
