import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const transaction = { LOCK: { UPDATE: "UPDATE" } };

jest.unstable_mockModule("../../config/database.js", () => ({
    default: { transaction: jest.fn(async (callback) => callback(transaction)) },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Doctor: { findOne: jest.fn() },
}));
jest.unstable_mockModule("../../src/modules/admin/services/doctorPhotoService.js", () => ({
    decodeDoctorPhoto: jest.fn(),
    removeDoctorPhoto: jest.fn(),
    storeDoctorPhoto: jest.fn(),
}));

const database = (await import("../../config/database.js")).default;
const { Doctor } = await import("../../src/models/associations.js");
const { decodeDoctorPhoto, removeDoctorPhoto, storeDoctorPhoto } =
    await import("../../src/modules/admin/services/doctorPhotoService.js");
const { updateDoctorProfilePhoto } =
    await import("../../src/modules/doctor/services/doctorProfilePhotoService.js");

function createDoctor(photoUrl = "/uploads/profile-photos/old.png") {
    const doctor = {
        id: 8,
        profile_photo_url: photoUrl,
        update: jest.fn(async (changes) => Object.assign(doctor, changes)),
    };
    return doctor;
}

describe("doctor profile photo service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        database.transaction.mockImplementation(async (callback) => callback(transaction));
        Doctor.findOne.mockResolvedValue(createDoctor());
        decodeDoctorPhoto.mockReturnValue({ bytes: Buffer.from("valid image"), extension: "png" });
        storeDoctorPhoto.mockResolvedValue("/uploads/profile-photos/new.png");
        removeDoctorPhoto.mockResolvedValue(undefined);
    });

    test("saves the photo only to the authenticated doctor's profile", async () => {
        const result = await updateDoctorProfilePhoto("42", "data:image/png;base64,aW1hZ2U=");

        expect(Doctor.findOne).toHaveBeenCalledWith({
            where: { user_id: 42 },
            attributes: ["id", "profile_photo_url"],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        expect(storeDoctorPhoto).toHaveBeenCalledWith("data:image/png;base64,aW1hZ2U=");
        expect(result).toEqual({
            profilePhotoUrl: "/uploads/profile-photos/new.png",
            message: "Tu foto de perfil se actualizó correctamente.",
        });
        expect(removeDoctorPhoto).toHaveBeenCalledWith("/uploads/profile-photos/old.png");
    });

    test("rejects invalid images before finding or changing a doctor", async () => {
        decodeDoctorPhoto.mockImplementation(() => {
            throw Object.assign(new Error("La foto debe ser JPG, PNG o WebP y no superar 2 MB."), {
                statusCode: 400,
            });
        });

        await expect(
            updateDoctorProfilePhoto(42, "data:image/svg+xml;base64,PHN2Zz4="),
        ).rejects.toMatchObject({ statusCode: 400 });

        expect(Doctor.findOne).not.toHaveBeenCalled();
        expect(storeDoctorPhoto).not.toHaveBeenCalled();
    });

    test("does not upload if the authenticated user has no doctor profile", async () => {
        Doctor.findOne.mockResolvedValue(null);

        await expect(
            updateDoctorProfilePhoto(42, "data:image/png;base64,aW1hZ2U="),
        ).rejects.toMatchObject({ statusCode: 404 });

        expect(storeDoctorPhoto).not.toHaveBeenCalled();
    });

    test("preserves the current image when database persistence fails", async () => {
        const doctor = createDoctor();
        doctor.update.mockRejectedValue(new Error("Database unavailable"));
        Doctor.findOne.mockResolvedValue(doctor);

        await expect(
            updateDoctorProfilePhoto(42, "data:image/png;base64,aW1hZ2U="),
        ).rejects.toThrow("Database unavailable");

        expect(removeDoctorPhoto).toHaveBeenCalledWith("/uploads/profile-photos/new.png");
        expect(removeDoctorPhoto).not.toHaveBeenCalledWith("/uploads/profile-photos/old.png");
    });

    test("rejects invalid authenticated user identifiers", async () => {
        await expect(
            updateDoctorProfilePhoto("invalid", "data:image/png;base64,aW1hZ2U="),
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(database.transaction).not.toHaveBeenCalled();
    });
});
