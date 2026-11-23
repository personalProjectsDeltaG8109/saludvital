import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

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
    EmailOutbox: { create: jest.fn(), findOne: jest.fn(), update: jest.fn() },
    Patient: { findOne: jest.fn() },
    Rol: { findByPk: jest.fn(), findOne: jest.fn() },
    Specialities: { findOne: jest.fn() },
    User: { findByPk: jest.fn(), findOne: jest.fn() },
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
jest.unstable_mockModule("../../src/modules/admin/services/adminDoctorService.js", () => ({
    cancelUpcomingConfirmedDoctorAppointments: jest.fn(),
}));

const database = (await import("../../config/database.js")).default;
const AuditLog = (await import("../../src/models/AuditLog.js")).default;
const EmergencyContact = (await import("../../src/models/EmergencyContact.js")).default;
const { Doctor, EmailOutbox, Patient, Rol, Specialities, User } =
    await import("../../src/models/associations.js");
const { resolveLocation } = await import("../../src/shared/services/colombiaLocationService.js");
const photoService = await import("../../src/shared/services/profilePhotoStorageService.js");
const { updateAdminUser, updateAdminUserProfile } =
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
    EmailOutbox.findOne.mockResolvedValue(null);
    EmailOutbox.update.mockResolvedValue([0]);
    EmailOutbox.create.mockResolvedValue({ id: 18 });
    Rol.findByPk.mockResolvedValue({ name: "Doctor" });
    Doctor.findOne.mockResolvedValue(doctor);
    Specialities.findOne.mockResolvedValue({ id: 5 });
    AuditLog.create.mockResolvedValue({});
    photoService.storeProfilePhoto.mockResolvedValue("/uploads/profile-photos/new.webp");
    photoService.removeStoredProfilePhoto.mockResolvedValue(undefined);
    return { doctor, transaction };
}

function preparePatientUpdate() {
    const transaction = { LOCK: { UPDATE: "UPDATE" } };
    const patient = {
        id: 31,
        user_id: 7,
        update: jest.fn().mockResolvedValue(undefined),
    };
    database.transaction.mockImplementation((callback) => callback(transaction));
    User.findByPk
        .mockResolvedValueOnce({ id: 7, email: "patient@example.com", role_id: 2 })
        .mockResolvedValueOnce({ id: 1, email: "admin@example.com" });
    User.findOne.mockResolvedValue(null);
    Rol.findByPk.mockResolvedValue({ name: "Patient" });
    Patient.findOne.mockResolvedValueOnce(patient).mockResolvedValueOnce(null);
    EmergencyContact.findOne.mockResolvedValue(null);
    resolveLocation.mockReturnValue({ department: "Risaralda", municipality: "Pereira" });
    AuditLog.create.mockResolvedValue({});

    return { patient, transaction };
}

function patientProfileWithBirthDate(dateOfBirth) {
    return {
        email: "patient@example.com",
        patient: {
            firstName: "Ana",
            lastName: "Pérez",
            phone: "3001234567",
            dateOfBirth,
            documentType: "CC",
            documentNumber: "123456789",
            departmentCode: "66",
            municipalityCode: "66001",
            bloodType: "",
            allergies: "",
            existingConditions: "",
            address: "",
            profilePhotoUrl: "",
        },
        emergencyContact: {},
    };
}

describe("Admin doctor profile updates", () => {
    beforeEach(() => jest.resetAllMocks());
    afterEach(() => jest.useRealTimers());

    test("routes doctor status changes through the doctor workflow", async () => {
        const transaction = { LOCK: { UPDATE: "UPDATE" } };
        database.transaction.mockImplementation((callback) => callback(transaction));
        Rol.findOne.mockResolvedValue({ id: 1 });
        User.findByPk.mockResolvedValue({ id: 7, role_id: 4, is_active: true });
        Rol.findByPk.mockResolvedValue({ id: 4, name: "Doctor" });
        Doctor.findOne.mockResolvedValue({ id: 12 });

        await expect(updateAdminUser(1, 7, { isActive: false })).rejects.toMatchObject({
            statusCode: 409,
        });
        expect(database.transaction).toHaveBeenCalledTimes(1);
    });

    test("prevents administrators from granting administrator access to another role", async () => {
        const transaction = { LOCK: { UPDATE: "UPDATE" } };
        database.transaction.mockImplementation((callback) => callback(transaction));
        Rol.findOne.mockResolvedValue({ id: 1 });
        User.findByPk.mockResolvedValue({
            id: 7,
            email: "patient@example.com",
            role_id: 2,
            is_active: true,
        });
        Rol.findByPk.mockResolvedValue({ id: 1, name: "Administrator" });

        await expect(updateAdminUser(1, 7, { roleId: 1 })).rejects.toMatchObject({
            statusCode: 403,
            message: "No puedes asignar el rol de administrador desde este módulo.",
        });

        expect(AuditLog.create).not.toHaveBeenCalled();
        expect(User.findByPk).toHaveBeenCalledTimes(1);
    });

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

        expect(photoService.storeProfilePhoto).toHaveBeenCalledWith(
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
                    specialty: { previousId: 3, nextId: 5 },
                }),
            }),
            { transaction },
        );
        expect(photoService.removeStoredProfilePhoto).toHaveBeenCalledWith(
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

        expect(photoService.removeStoredProfilePhoto).toHaveBeenCalledWith(
            "/uploads/profile-photos/new.webp",
        );
        expect(photoService.removeStoredProfilePhoto).not.toHaveBeenCalledWith(
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
        expect(photoService.removeStoredProfilePhoto).toHaveBeenCalledWith(
            "/uploads/profile-photos/old.jpg",
        );
        expect(photoService.storeProfilePhoto).not.toHaveBeenCalled();
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                changes: expect.not.objectContaining({ specialty: expect.anything() }),
            }),
            expect.any(Object),
        );
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
        expect(photoService.storeProfilePhoto).not.toHaveBeenCalled();
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

    test("keeps a doctor's current email until the replacement address is verified", async () => {
        const { doctor, transaction } = prepareDoctorUpdate();
        const verifiedUser = {
            id: 7,
            email: "doctor@example.com",
            email_verified_at: new Date("2026-10-01T12:00:00.000Z"),
            role_id: 4,
            update: jest.fn(async (values) => Object.assign(verifiedUser, values)),
        };
        User.findByPk
            .mockReset()
            .mockResolvedValueOnce(verifiedUser)
            .mockResolvedValueOnce({ id: 1, email: "admin@example.com" });

        const result = await updateAdminUserProfile(1, 7, {
            email: "replacement@example.com",
            doctor: {
                displayName: "Dra. Actualizada",
                specialtyId: "3",
                professionalInformation: "",
                profilePhotoUrl: "/uploads/profile-photos/old.jpg",
            },
        });

        expect(verifiedUser.email).toBe("doctor@example.com");
        expect(verifiedUser.pending_email).toBe("replacement@example.com");
        expect(verifiedUser.update).toHaveBeenCalledWith(
            expect.objectContaining({ pending_email: "replacement@example.com" }),
            { transaction },
        );
        expect(EmailOutbox.create).toHaveBeenCalledWith(
            expect.objectContaining({ event_type: "email_verification", status: "pending" }),
            { transaction },
        );
        expect(result.message).toContain("El correo actual sigue activo");
        expect(doctor.update).toHaveBeenCalled();
    });

    test("rejects tomorrow as a patient birth date after 7 p.m. in Colombia", async () => {
        jest.useFakeTimers().setSystemTime(new Date("2026-11-21T01:00:00.000Z"));
        const { patient } = preparePatientUpdate();

        await expect(
            updateAdminUserProfile(1, 7, patientProfileWithBirthDate("2026-11-21")),
        ).rejects.toMatchObject({ statusCode: 400 });

        expect(patient.update).not.toHaveBeenCalled();
        expect(AuditLog.create).not.toHaveBeenCalled();
    });

    test("accepts today's patient birth date after 7 p.m. in Colombia", async () => {
        jest.useFakeTimers().setSystemTime(new Date("2026-11-21T01:00:00.000Z"));
        const { patient, transaction } = preparePatientUpdate();

        await expect(
            updateAdminUserProfile(1, 7, patientProfileWithBirthDate("2026-11-20")),
        ).resolves.toMatchObject({ message: expect.any(String) });

        expect(patient.update).toHaveBeenCalledWith(
            expect.objectContaining({ date_of_birth: "2026-11-20" }),
            { transaction },
        );
    });

    test("accepts today's patient birth date just after midnight in Colombia", async () => {
        jest.useFakeTimers().setSystemTime(new Date("2026-11-21T05:00:00.000Z"));
        const { patient } = preparePatientUpdate();

        await expect(
            updateAdminUserProfile(1, 7, patientProfileWithBirthDate("2026-11-21")),
        ).resolves.toMatchObject({ message: expect.any(String) });

        expect(patient.update).toHaveBeenCalledWith(
            expect.objectContaining({ date_of_birth: "2026-11-21" }),
            expect.any(Object),
        );
    });
});
