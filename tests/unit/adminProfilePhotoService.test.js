import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const transaction = { LOCK: { UPDATE: "UPDATE" } };

jest.unstable_mockModule("../../config/database.js", () => ({
    default: {
        transaction: jest.fn(async (callback) => callback(transaction)),
    },
}));
jest.unstable_mockModule("../../src/models/AuditLog.js", () => ({
    default: { create: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Rol: {},
    User: { findByPk: jest.fn() },
}));
jest.unstable_mockModule("../../src/modules/admin/services/doctorPhotoService.js", () => ({
    decodeDoctorPhoto: jest.fn(),
    removeDoctorPhoto: jest.fn(),
    storeDoctorPhoto: jest.fn(),
}));

const database = (await import("../../config/database.js")).default;
const AuditLog = (await import("../../src/models/AuditLog.js")).default;
const { User } = await import("../../src/models/associations.js");
const { decodeDoctorPhoto, removeDoctorPhoto, storeDoctorPhoto } =
    await import("../../src/modules/admin/services/doctorPhotoService.js");
const { removeAdminProfilePhoto, updateAdminProfilePhoto } =
    await import("../../src/modules/admin/services/adminProfilePhotoService.js");

function createAdministrator(photoUrl = "/uploads/profile-photos/old.png") {
    const user = {
        id: 12,
        email: "admin@example.com",
        is_active: true,
        profile_photo_url: photoUrl,
        rol: { name: "Administrator" },
        update: jest.fn(async (values) => Object.assign(user, values)),
    };
    return user;
}

describe("administrator profile photo service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        User.findByPk.mockResolvedValue(createAdministrator());
        AuditLog.create.mockResolvedValue({ id: 4 });
        decodeDoctorPhoto.mockReturnValue({ bytes: Buffer.from("image"), extension: "png" });
        storeDoctorPhoto.mockResolvedValue("/uploads/profile-photos/new.png");
        removeDoctorPhoto.mockResolvedValue(undefined);
        database.transaction.mockImplementation(async (callback) => callback(transaction));
    });

    test("stores, persists, and audits the new photo before removing the old file", async () => {
        const result = await updateAdminProfilePhoto("12", "data:image/png;base64,aW1hZ2U=");

        expect(result).toEqual({
            profilePhotoUrl: "/uploads/profile-photos/new.png",
            message: "Tu foto de perfil se actualizó correctamente.",
        });
        expect(decodeDoctorPhoto).toHaveBeenCalledWith("data:image/png;base64,aW1hZ2U=");
        expect(User.findByPk).toHaveBeenCalledWith(
            12,
            expect.objectContaining({
                attributes: ["id", "email", "is_active", "profile_photo_url"],
                transaction,
                lock: transaction.LOCK.UPDATE,
            }),
        );
        expect(storeDoctorPhoto).toHaveBeenCalledWith("data:image/png;base64,aW1hZ2U=");
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                actor_user_id: 12,
                action: "AdminUserProfilePhotoUpdated",
                target_type: "User",
                target_id: "12",
                target_description: "Administrator profile photo",
                changes: null,
            }),
            { transaction },
        );
        expect(JSON.stringify(AuditLog.create.mock.calls)).not.toContain("aW1hZ2U=");
        expect(removeDoctorPhoto).toHaveBeenCalledWith("/uploads/profile-photos/old.png");
    });

    test("rejects invalid image data before loading the administrator", async () => {
        decodeDoctorPhoto.mockImplementation(() => {
            throw Object.assign(new Error("La foto no es válida."), { statusCode: 400 });
        });

        await expect(updateAdminProfilePhoto("12", "not-an-image")).rejects.toMatchObject({
            statusCode: 400,
        });

        expect(User.findByPk).not.toHaveBeenCalled();
        expect(storeDoctorPhoto).not.toHaveBeenCalled();
    });

    test("rejects accounts that are not active administrators", async () => {
        User.findByPk.mockResolvedValue({
            id: 12,
            is_active: true,
            profile_photo_url: "/uploads/profile-photos/old.png",
            rol: { name: "Doctor" },
        });

        await expect(
            updateAdminProfilePhoto(12, "data:image/png;base64,aW1hZ2U="),
        ).rejects.toMatchObject({
            statusCode: 404,
        });

        expect(storeDoctorPhoto).not.toHaveBeenCalled();
    });

    test("keeps the old photo when persistence fails and removes the new file", async () => {
        const user = createAdministrator();
        user.update.mockRejectedValue(new Error("Database unavailable"));
        User.findByPk.mockResolvedValue(user);

        await expect(updateAdminProfilePhoto(12, "data:image/png;base64,aW1hZ2U=")).rejects.toThrow(
            "Database unavailable",
        );

        expect(removeDoctorPhoto).toHaveBeenCalledWith("/uploads/profile-photos/new.png");
        expect(removeDoctorPhoto).not.toHaveBeenCalledWith("/uploads/profile-photos/old.png");
    });

    test("does not remove the old photo if audit persistence fails", async () => {
        AuditLog.create.mockRejectedValue(new Error("Audit unavailable"));

        await expect(updateAdminProfilePhoto(12, "data:image/png;base64,aW1hZ2U=")).rejects.toThrow(
            "Audit unavailable",
        );

        expect(removeDoctorPhoto).toHaveBeenCalledWith("/uploads/profile-photos/new.png");
        expect(removeDoctorPhoto).not.toHaveBeenCalledWith("/uploads/profile-photos/old.png");
    });

    test("removes the database reference and stored photo after confirming the account", async () => {
        const user = createAdministrator();
        User.findByPk.mockResolvedValue(user);

        await expect(removeAdminProfilePhoto("12")).resolves.toEqual({
            profilePhotoUrl: null,
            message: "Tu foto de perfil se eliminó correctamente.",
        });

        expect(user.update).toHaveBeenCalledWith({ profile_photo_url: null }, { transaction });
        expect(AuditLog.create).toHaveBeenCalledTimes(1);
        expect(AuditLog.create.mock.calls[0][0].action).toBe("AdminUserProfilePhotoRemoved");
        expect(removeDoctorPhoto).toHaveBeenCalledWith("/uploads/profile-photos/old.png");
    });

    test("does not audit or remove a file when no photo exists", async () => {
        User.findByPk.mockResolvedValue(createAdministrator(null));

        await expect(removeAdminProfilePhoto(12)).resolves.toMatchObject({
            profilePhotoUrl: null,
            message: "No tienes una foto de perfil para eliminar.",
        });

        expect(AuditLog.create).not.toHaveBeenCalled();
        expect(removeDoctorPhoto).not.toHaveBeenCalled();
    });
});
