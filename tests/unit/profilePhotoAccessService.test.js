import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: { findOne: jest.fn() },
    Doctor: { findOne: jest.fn() },
    Patient: { findOne: jest.fn() },
    Rol: {},
    User: { findOne: jest.fn() },
}));

const { Appointment, Doctor, Patient, User } = await import("../../src/models/associations.js");
const { canAccessProfilePhoto } =
    await import("../../src/shared/services/profilePhotoAccessService.js");

const photoUrl = "/uploads/profile-photos/123e4567-e89b-42d3-a456-426614174000.webp";

describe("profile photo access rules", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("allows administrators to view photos referenced by managed profiles", async () => {
        Doctor.findOne.mockResolvedValue({ id: 4 });

        await expect(
            canAccessProfilePhoto({ userId: "1", role: "Administrator", photoUrl }),
        ).resolves.toBe(true);
        expect(Doctor.findOne).toHaveBeenCalledWith({
            where: { profile_photo_url: photoUrl },
            attributes: ["id"],
        });
    });

    test("allows patients to view their own and active doctor profile photos", async () => {
        Patient.findOne.mockResolvedValueOnce({ id: 8 });
        await expect(
            canAccessProfilePhoto({ userId: "12", role: "Patient", photoUrl }),
        ).resolves.toBe(true);
        expect(Doctor.findOne).not.toHaveBeenCalled();

        Patient.findOne.mockResolvedValueOnce(null);
        Doctor.findOne.mockResolvedValueOnce({ id: 4 });
        await expect(
            canAccessProfilePhoto({ userId: "12", role: "Patient", photoUrl }),
        ).resolves.toBe(true);
        expect(Doctor.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                include: [
                    expect.objectContaining({
                        where: { is_active: true },
                        include: [expect.objectContaining({ where: { name: "Doctor" } })],
                    }),
                ],
            }),
        );
    });

    test("allows doctors to view only their own photos or patients linked by appointments", async () => {
        Doctor.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 7 });
        Patient.findOne.mockResolvedValue({ id: 8 });

        await expect(
            canAccessProfilePhoto({ userId: "16", role: "Doctor", photoUrl }),
        ).resolves.toBe(true);
        expect(Appointment.findOne).not.toHaveBeenCalled();
        expect(Patient.findOne).toHaveBeenCalledWith({
            where: { profile_photo_url: photoUrl },
            attributes: ["id"],
            include: [
                expect.objectContaining({
                    where: { doctor_id: 7 },
                    required: true,
                }),
            ],
        });
    });

    test("denies unrelated profiles, unknown roles, and malformed photo URLs", async () => {
        Doctor.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 7 });
        Patient.findOne.mockResolvedValue(null);

        await expect(
            canAccessProfilePhoto({ userId: "16", role: "Doctor", photoUrl }),
        ).resolves.toBe(false);
        await expect(
            canAccessProfilePhoto({ userId: "16", role: "Staff", photoUrl }),
        ).resolves.toBe(false);
        await expect(
            canAccessProfilePhoto({ userId: "16", role: "Doctor", photoUrl: "/uploads/other.png" }),
        ).resolves.toBe(false);
        await expect(
            canAccessProfilePhoto({ userId: "0", role: "Administrator", photoUrl }),
        ).resolves.toBe(false);
        expect(User.findOne).not.toHaveBeenCalled();
    });
});
