import { describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Doctor: { findOne: jest.fn(), update: jest.fn() },
    Specialities: {},
    User: {},
}));

const models = await import("../../src/models/associations.js");
const { getDoctorProfile, validateDoctorProfileUpdateFields } =
    await import("../../src/modules/doctor/services/doctorProfileService.js");

describe("doctor profile service", () => {
    test("returns the authenticated doctor's persisted profile without credentials", async () => {
        models.Doctor.findOne.mockResolvedValue({
            display_name: "Carlos Ramírez",
            profile_photo_url: "/uploads/profile-photos/doctor.png",
            alternate_phone: null,
            address: null,
            department: null,
            municipality: null,
            created_at: new Date("2024-01-15T12:00:00.000Z"),
            specialty: { name: "Medicina General" },
            user: {
                display_name: null,
                email: "carlos@example.co",
                phone: "+573001234567",
                is_active: true,
                email_verified_at: new Date("2025-01-10T12:00:00.000Z"),
                created_at: new Date("2024-01-15T12:00:00.000Z"),
            },
        });

        const profile = await getDoctorProfile("42");

        expect(models.Doctor.findOne).toHaveBeenCalledWith({
            where: { user_id: "42" },
            attributes: [
                "id",
                "display_name",
                "profile_photo_url",
                "alternate_phone",
                "address",
                "department",
                "municipality",
                "created_at",
            ],
            include: [
                {
                    model: models.User,
                    as: "user",
                    attributes: [
                        "id",
                        "display_name",
                        "email",
                        "phone",
                        "is_active",
                        "email_verified_at",
                        "created_at",
                    ],
                    required: true,
                },
                {
                    model: models.Specialities,
                    as: "specialty",
                    attributes: ["name"],
                    required: false,
                },
            ],
        });
        expect(profile).toMatchObject({
            fullName: "Carlos Ramírez",
            specialty: "Medicina General",
            accountStatus: "Cuenta activa",
            isActive: true,
            photoUrl: "/uploads/profile-photos/doctor.png",
            contact: [
                { label: "Correo electrónico", verificationStatus: "Verificado" },
                { label: "Teléfono principal", value: "+573001234567" },
                { label: "Teléfono alternativo", value: "No registrado" },
            ],
        });
        expect(profile.personalInformation.find((field) => field.label === "Nombres").value).toBe(
            "No registrado",
        );
        expect(
            profile.personalInformation.find((field) => field.label === "Especialidad").isProtected,
        ).toBe(true);
        expect(
            profile.personalInformation.find((field) => field.label === "Teléfono principal")
                .isProtected,
        ).toBe(false);
        expect(JSON.stringify(profile)).not.toMatch(/password|token|secret/i);
    });

    test("does not permit lookup by another doctor's ID and returns not found without a profile", async () => {
        models.Doctor.findOne.mockResolvedValue(null);

        await expect(getDoctorProfile("42")).rejects.toMatchObject({
            statusCode: 404,
            message: "No se encontró el perfil médico.",
        });
        expect(models.Doctor.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ where: { user_id: "42" } }),
        );
    });

    test.each([
        "firstName",
        "lastName",
        "documentType",
        "documentNumber",
        "professionalRegistration",
        "specialtyId",
        "email",
        "gender",
        "dateOfBirth",
    ])("rejects self-service updates to protected field %s", (field) => {
        expect(() => validateDoctorProfileUpdateFields({ [field]: "attempted change" })).toThrow(
            "solo pueden ser modificados por un administrador",
        );
        expect(models.Doctor.update).not.toHaveBeenCalled();
    });

    test("rejects mixed allowed and protected updates atomically", () => {
        expect(() =>
            validateDoctorProfileUpdateFields({ phone: "+573001234567", email: "new@example.co" }),
        ).toThrow("solo pueden ser modificados por un administrador");
        expect(models.Doctor.update).not.toHaveBeenCalled();
    });

    test("returns only explicitly allowed self-service fields", () => {
        expect(
            validateDoctorProfileUpdateFields({ phone: "+573001234567", city: "Pereira" }),
        ).toEqual({
            phone: "+573001234567",
            city: "Pereira",
        });
    });
});
