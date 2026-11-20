import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("sequelize", () => ({
    Op: { like: Symbol("like"), ne: Symbol("ne"), or: Symbol("or") },
}));
jest.unstable_mockModule("../../config/database.js", () => ({
    default: { transaction: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/AuditLog.js", () => ({
    default: { create: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/EmergencyContact.js", () => ({
    default: { findOne: jest.fn(), create: jest.fn(), destroy: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Doctor: { findOne: jest.fn(), create: jest.fn() },
    EmailOutbox: { create: jest.fn(), findOne: jest.fn(), update: jest.fn() },
    Patient: { findOne: jest.fn(), create: jest.fn() },
    Rol: { findByPk: jest.fn(), findOne: jest.fn() },
    Specialities: { findOne: jest.fn(), findAll: jest.fn() },
    User: { findByPk: jest.fn(), findAll: jest.fn() },
}));
jest.unstable_mockModule("../../src/shared/services/colombiaLocationService.js", () => ({
    getDepartments: jest.fn(),
    getMunicipalities: jest.fn(),
    resolveLocation: jest.fn(),
}));
jest.unstable_mockModule("../../src/shared/services/profilePhotoStorageService.js", () => ({
    storeProfilePhoto: jest.fn(),
    removeStoredProfilePhoto: jest.fn(),
}));
jest.unstable_mockModule("../../src/modules/auth/services/emailChangeService.js", () => ({
    isEmailUnavailable: jest.fn(),
    isEmailUniqueConstraintError: jest.fn(),
    requestEmailChange: jest.fn(),
}));
jest.unstable_mockModule("../../src/modules/admin/services/adminDoctorService.js", () => ({
    cancelUpcomingConfirmedDoctorAppointments: jest.fn(),
}));

const database = (await import("../../config/database.js")).default;
const AuditLog = (await import("../../src/models/AuditLog.js")).default;
const { Doctor, Patient, Rol, Specialities, User } =
    await import("../../src/models/associations.js");
const { resolveLocation } = await import("../../src/shared/services/colombiaLocationService.js");
const { cancelUpcomingConfirmedDoctorAppointments } =
    await import("../../src/modules/admin/services/adminDoctorService.js");
const { updateAdminUser, updateAdminUserRole } =
    await import("../../src/modules/admin/services/adminUserManagementService.js");

const transaction = { LOCK: { UPDATE: "UPDATE" } };

function prepareRoleChange({ currentRole, targetRole, patient = null, doctor = null } = {}) {
    const user = {
        id: 7,
        email: "person@example.com",
        role_id: currentRole.id,
        is_active: true,
        update: jest.fn().mockImplementation(async (changes) => Object.assign(user, changes)),
    };
    database.transaction.mockImplementation((callback) => callback(transaction));
    Rol.findOne.mockResolvedValue({ id: 1 });
    Rol.findByPk.mockImplementation(async (id) => {
        if (Number(id) === currentRole.id) return currentRole;
        if (Number(id) === targetRole.id) return targetRole;
        return null;
    });
    User.findByPk.mockImplementation(async (id) =>
        Number(id) === user.id ? user : { id: 1, email: "admin@example.com" },
    );
    Patient.findOne.mockResolvedValue(patient);
    Doctor.findOne.mockResolvedValue(doctor);
    Patient.create.mockResolvedValue({ id: 20 });
    Doctor.create.mockResolvedValue({ id: 12 });
    Specialities.findOne.mockResolvedValue({ id: 5 });
    AuditLog.create.mockResolvedValue({});
    cancelUpcomingConfirmedDoctorAppointments.mockResolvedValue(2);
    resolveLocation.mockReturnValue({ department: "Caldas", municipality: "Manizales" });
    return { user };
}

describe("Admin user role and profile changes", () => {
    beforeEach(() => jest.resetAllMocks());

    test("creates a doctor profile with the selected specialty when a patient becomes a doctor", async () => {
        const patient = { id: 15, first_name: "Juan Esteban", last_name: "Montoya Marín" };
        const { user } = prepareRoleChange({
            currentRole: { id: 2, name: "Patient" },
            targetRole: { id: 3, name: "Doctor" },
            patient,
        });

        await expect(
            updateAdminUserRole(1, 7, { roleId: 3, doctor: { specialtyId: "5" } }),
        ).resolves.toMatchObject({ user: { role: { name: "Doctor" }, profileType: "Doctor" } });

        expect(Doctor.create).toHaveBeenCalledWith(
            {
                user_id: 7,
                specialty_id: 5,
                display_name: "Juan Esteban Montoya Marín",
                professional_information: null,
                profile_photo_url: null,
            },
            { transaction },
        );
        expect(user.update).toHaveBeenCalledWith({ role_id: 3 }, { transaction });
        expect(cancelUpcomingConfirmedDoctorAppointments).not.toHaveBeenCalled();
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "AdminUserRoleChanged",
                changes: expect.objectContaining({ createdProfile: "Doctor" }),
            }),
            { transaction },
        );
    });

    test("keeps patient and doctor history and cancels future appointments when a doctor becomes a patient", async () => {
        const { user } = prepareRoleChange({
            currentRole: { id: 3, name: "Doctor" },
            targetRole: { id: 2, name: "Patient" },
            patient: { id: 22 },
            doctor: { id: 12, user_id: 7 },
        });

        await expect(updateAdminUserRole(1, 7, { roleId: 2 })).resolves.toMatchObject({
            user: { role: { name: "Patient" }, profileType: "Patient" },
        });

        expect(cancelUpcomingConfirmedDoctorAppointments).toHaveBeenCalledWith(
            12,
            1,
            "admin@example.com",
            transaction,
            "The doctor's role was changed to patient by an administrator.",
        );
        expect(user.update).toHaveBeenCalledWith({ role_id: 2 }, { transaction });
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "AdminUserRoleChanged",
                changes: expect.objectContaining({ cancelledAppointmentCount: 2 }),
            }),
            { transaction },
        );
    });

    test("does not create a patient profile without the account holder's registration and consent", async () => {
        prepareRoleChange({
            currentRole: { id: 3, name: "Doctor" },
            targetRole: { id: 2, name: "Patient" },
            doctor: { id: 12, user_id: 7 },
        });

        await expect(updateAdminUserRole(1, 7, { roleId: 2 })).rejects.toMatchObject({
            statusCode: 409,
            message: expect.stringContaining("consentimiento"),
        });
        expect(Patient.create).not.toHaveBeenCalled();
        expect(cancelUpcomingConfirmedDoctorAppointments).not.toHaveBeenCalled();
        expect(AuditLog.create).not.toHaveBeenCalled();
    });

    test("rejects role changes through the generic account endpoint", async () => {
        prepareRoleChange({
            currentRole: { id: 2, name: "Patient" },
            targetRole: { id: 3, name: "Doctor" },
        });

        await expect(updateAdminUser(1, 7, { roleId: 3 })).rejects.toMatchObject({
            statusCode: 409,
            message: expect.stringContaining("flujo de cambio de perfil"),
        });
        expect(AuditLog.create).not.toHaveBeenCalled();
    });
});
