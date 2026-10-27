import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Doctor: {},
    Patient: {},
    Rol: {},
    User: { findByPk: jest.fn() },
}));

const { User } = await import("../../src/models/associations.js");
const { getAdminProfile } = await import("../../src/modules/admin/services/adminProfileService.js");

describe("administrator profile service", () => {
    beforeEach(() => jest.clearAllMocks());

    test("returns the authenticated administrator's persisted, safe profile fields", async () => {
        User.findByPk.mockResolvedValue({
            display_name: "Laura Méndez",
            email: "laura@example.com",
            is_active: true,
            created_at: new Date("2025-01-15T10:00:00.000Z"),
            last_login_at: new Date("2026-10-27T10:24:00.000Z"),
            password_hash: "must-not-be-returned",
            rol: { name: "Administrator" },
        });

        const profile = await getAdminProfile("7");

        expect(profile).toMatchObject({
            displayName: "Laura Méndez",
            email: "laura@example.com",
            role: "Administrator",
            isActive: true,
            initials: "LM",
        });
        expect(profile).not.toHaveProperty("password_hash");
        expect(JSON.stringify(profile)).not.toContain("must-not-be-returned");
        expect(User.findByPk).toHaveBeenCalledWith(7, {
            attributes: [
                "id",
                "display_name",
                "email",
                "phone",
                "is_active",
                "created_at",
                "last_login_at",
            ],
            include: [
                { model: {}, as: "rol", attributes: ["name"], required: true },
                {
                    model: {},
                    as: "doctor",
                    attributes: ["display_name", "profile_photo_url"],
                    required: false,
                },
                {
                    model: {},
                    as: "patient",
                    attributes: ["first_name", "last_name", "profile_photo_url"],
                    required: false,
                },
            ],
        });
    });

    test("uses linked profile names and default initials when an account has no profile photo", async () => {
        User.findByPk.mockResolvedValue({
            display_name: null,
            email: "admin@example.com",
            is_active: true,
            created_at: null,
            last_login_at: null,
            rol: { name: "Administrator" },
            patient: { first_name: "Juan", last_name: "Montoya", profile_photo_url: null },
        });

        await expect(getAdminProfile(3)).resolves.toMatchObject({
            displayName: "Juan Montoya",
            initials: "JM",
            profilePhotoUrl: null,
            createdAt: null,
            lastLoginAt: null,
        });
    });

    test("rejects invalid IDs and accounts that are not administrators", async () => {
        await expect(getAdminProfile("invalid")).rejects.toMatchObject({ statusCode: 400 });
        expect(User.findByPk).not.toHaveBeenCalled();

        User.findByPk.mockResolvedValue({ rol: { name: "Doctor" } });
        await expect(getAdminProfile(9)).rejects.toMatchObject({ statusCode: 404 });
    });
});
