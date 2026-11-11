import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Patient: { findOne: jest.fn() },
    User: { findByPk: jest.fn() },
}));
jest.unstable_mockModule("../../src/shared/services/profilePhotoStorageService.js", () => ({
    decodeProfilePhoto: jest.fn(),
    removeStoredProfilePhoto: jest.fn(),
    storeDecodedProfilePhoto: jest.fn(),
}));

const { Patient } = await import("../../src/models/associations.js");
const { decodeProfilePhoto, removeStoredProfilePhoto, storeDecodedProfilePhoto } =
    await import("../../src/shared/services/profilePhotoStorageService.js");
const { deletePatientProfilePhoto, updatePatientProfilePhoto } =
    await import("../../src/modules/patient/services/profileMediaService.js");

function createPatient(photoUrl = "/uploads/profile-photos/old.png") {
    const patient = {
        id: 7,
        profile_photo_url: photoUrl,
        update: jest.fn(async (changes) => Object.assign(patient, changes)),
    };
    return patient;
}

describe("patient profile photo service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Patient.findOne.mockResolvedValue(createPatient());
        decodeProfilePhoto.mockReturnValue({ bytes: Buffer.from("image"), extension: "png" });
        storeDecodedProfilePhoto.mockResolvedValue("/uploads/profile-photos/new.png");
        removeStoredProfilePhoto.mockResolvedValue(undefined);
    });

    test("updates the patient photo and removes the previous managed file", async () => {
        await expect(updatePatientProfilePhoto(31, "data:image/png;base64,aW1hZ2U=")).resolves.toBe(
            "/uploads/profile-photos/new.png",
        );

        expect(Patient.findOne).toHaveBeenCalledWith({ where: { user_id: 31 } });
        expect(decodeProfilePhoto).toHaveBeenCalledWith("data:image/png;base64,aW1hZ2U=");
        expect(storeDecodedProfilePhoto).toHaveBeenCalledWith({
            bytes: Buffer.from("image"),
            extension: "png",
        });
        expect(removeStoredProfilePhoto).toHaveBeenCalledWith("/uploads/profile-photos/old.png");
    });

    test("keeps patient-specific validation messages for invalid input", async () => {
        decodeProfilePhoto.mockImplementation(() => {
            throw Object.assign(new Error("Invalid image"), {
                code: "PROFILE_PHOTO_INVALID_SIZE",
                statusCode: 400,
            });
        });

        const error = await updatePatientProfilePhoto(31, "not-an-image").catch((caught) => caught);

        expect(error.message).toBe("La foto debe pesar como máximo 2 MB.");
        expect(error.status).toBe(400);
        expect(Patient.findOne).not.toHaveBeenCalled();
        expect(storeDecodedProfilePhoto).not.toHaveBeenCalled();
    });

    test("removes a newly stored file when saving its URL fails", async () => {
        const patient = createPatient();
        patient.update.mockRejectedValue(new Error("Database unavailable"));
        Patient.findOne.mockResolvedValue(patient);

        await expect(
            updatePatientProfilePhoto(31, "data:image/png;base64,aW1hZ2U="),
        ).rejects.toThrow("Database unavailable");

        expect(removeStoredProfilePhoto).toHaveBeenCalledWith("/uploads/profile-photos/new.png");
        expect(removeStoredProfilePhoto).not.toHaveBeenCalledWith(
            "/uploads/profile-photos/old.png",
        );
    });

    test("clears the patient photo and removes its managed file", async () => {
        const patient = createPatient();
        Patient.findOne.mockResolvedValue(patient);
        await deletePatientProfilePhoto(31);

        expect(Patient.findOne).toHaveBeenCalledWith({ where: { user_id: 31 } });
        expect(patient.update).toHaveBeenCalledWith({ profile_photo_url: null });
        expect(removeStoredProfilePhoto).toHaveBeenCalledWith("/uploads/profile-photos/old.png");
    });
});
