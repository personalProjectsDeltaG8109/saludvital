import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("sequelize", () => ({
    Op: { ne: Symbol("ne"), or: Symbol("or") },
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
    Doctor: { findOne: jest.fn() },
    EmailOutbox: { create: jest.fn() },
    Patient: {},
    Rol: { findByPk: jest.fn() },
    Specialities: { findOne: jest.fn() },
    User: { findByPk: jest.fn(), findOne: jest.fn() },
}));
jest.unstable_mockModule("../../src/modules/auth/services/locationService.js", () => ({
    getDepartments: jest.fn(),
    getMunicipalities: jest.fn(),
    resolveLocation: jest.fn(),
}));
jest.unstable_mockModule("../../src/modules/admin/services/doctorPhotoService.js", () => ({
    storeDoctorPhoto: jest.fn(),
    removeDoctorPhoto: jest.fn(),
}));

const database = (await import("../../config/database.js")).default;
const AuditLog = (await import("../../src/models/AuditLog.js")).default;
const { Doctor, Rol, Specialities, User } = await import("../../src/models/associations.js");
const photoService = await import("../../src/modules/admin/services/doctorPhotoService.js");
const { updateAdminUserProfile } =
    await import("../../src/modules/admin/services/adminUserManagementService.js");

function prepareDoctorUpdate() {
    const transaction = { LOCK: { UPDATE: "UPDATE" } };
    const doctor = {
        id: 12,
        user_id: 7,
        specialty_id: 3,
        profile_photo_url: "/uploads/profile-photos/old.jpg",
        update: jest.fn().mockResolvedValue(undefined),
    };
    database.transaction.mockImplementation((callback) => callback(transaction));
    User.findByPk
        .mockResolvedValueOnce({ id: 7, email: "doctor@example.com", role_id: 4 })
        .mockResolvedValueOnce({ id: 1, email: "admin@example.com" });
    User.findOne.mockResolvedValue(null);
    Rol.findByPk.mockResolvedValue({ name: "Doctor" });
    Doctor.findOne.mockResolvedValue(doctor);
    Specialities.findOne.mockResolvedValue({ id: 5 });
    AuditLog.create.mockResolvedValue({});
    photoService.storeDoctorPhoto.mockResolvedValue("/uploads/profile-photos/new.webp");
    photoService.removeDoctorPhoto.mockResolvedValue(undefined);
    return { doctor, transaction };
}

describe("Admin doctor profile updates", () => {
    beforeEach(() => jest.resetAllMocks());

    test("updates doctor details and photo transactionally and records field names", async () => {
        const { doctor, transaction } = prepareDoctorUpdate();

        await expect(
            updateAdminUserProfile(1, 7, {
                email: "doctor@example.com",
                doctor: {
                    displayName: "Dra. Actualizada",
                    specialtyId: "5",
                    professionalInformation: "Atención primaria",
                    profilePhotoUrl: "/uploads/profile-photos/old.jpg",
                    photo: "data:image/webp;base64,new-photo",
                },
            }),
        ).resolves.toMatchObject({ message: expect.any(String) });

        expect(photoService.storeDoctorPhoto).toHaveBeenCalledWith(
            "data:image/webp;base64,new-photo",
        );
        expect(doctor.update).toHaveBeenCalledWith(
            expect.objectContaining({
                display_name: "Dra. Actualizada",
                specialty_id: 5,
                professional_information: "Atención primaria",
                profile_photo_url: "/uploads/profile-photos/new.webp",
            }),
            { transaction },
        );
        expect(doctor.update.mock.calls[0][0]).not.toHaveProperty("photo");
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "AdminUserProfileUpdated",
                changes: expect.objectContaining({
                    profile: expect.arrayContaining(["profile_photo_url"]),
                }),
            }),
            { transaction },
        );
        expect(photoService.removeDoctorPhoto).toHaveBeenCalledWith(
            "/uploads/profile-photos/old.jpg",
        );
    });

    test("removes a newly saved photo if the profile transaction fails", async () => {
        const { doctor } = prepareDoctorUpdate();
        doctor.update.mockRejectedValue(new Error("database failure"));

        await expect(
            updateAdminUserProfile(1, 7, {
                email: "doctor@example.com",
                doctor: {
                    displayName: "Dr. Example",
                    specialtyId: "5",
                    professionalInformation: "",
                    profilePhotoUrl: "/uploads/profile-photos/old.jpg",
                    photo: "data:image/png;base64,new-photo",
                },
            }),
        ).rejects.toThrow("database failure");

        expect(photoService.removeDoctorPhoto).toHaveBeenCalledWith(
            "/uploads/profile-photos/new.webp",
        );
        expect(photoService.removeDoctorPhoto).not.toHaveBeenCalledWith(
            "/uploads/profile-photos/old.jpg",
        );
    });

    test("removes the previous profile photo when the administrator clears it", async () => {
        const { doctor } = prepareDoctorUpdate();

        await updateAdminUserProfile(1, 7, {
            email: "doctor@example.com",
            doctor: {
                displayName: "Dr. Example",
                specialtyId: "3",
                professionalInformation: "",
                profilePhotoUrl: "",
            },
        });

        expect(doctor.update).toHaveBeenCalledWith(
            expect.objectContaining({ profile_photo_url: null }),
            expect.any(Object),
        );
        expect(photoService.removeDoctorPhoto).toHaveBeenCalledWith(
            "/uploads/profile-photos/old.jpg",
        );
        expect(photoService.storeDoctorPhoto).not.toHaveBeenCalled();
    });

    test("does not assign an inactive specialty that is not already assigned", async () => {
        const { doctor } = prepareDoctorUpdate();
        Specialities.findOne.mockResolvedValue(null);

        await expect(
            updateAdminUserProfile(1, 7, {
                email: "doctor@example.com",
                doctor: {
                    displayName: "Dr. Example",
                    specialtyId: "9",
                    professionalInformation: "",
                    profilePhotoUrl: "/uploads/profile-photos/old.jpg",
                },
            }),
        ).rejects.toMatchObject({ statusCode: 400 });

        expect(doctor.update).not.toHaveBeenCalled();
        expect(photoService.storeDoctorPhoto).not.toHaveBeenCalled();
    });

    test("rejects an email already used by another account", async () => {
        const { doctor } = prepareDoctorUpdate();
        User.findOne.mockResolvedValue({ id: 99 });

        await expect(
            updateAdminUserProfile(1, 7, {
                email: "taken@example.com",
                doctor: {
                    displayName: "Dr. Example",
                    specialtyId: "3",
                    professionalInformation: "",
                    profilePhotoUrl: "/uploads/profile-photos/old.jpg",
                },
            }),
        ).rejects.toMatchObject({ statusCode: 409 });

        expect(doctor.update).not.toHaveBeenCalled();
    });
});
