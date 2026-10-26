import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("sequelize", () => ({
    Op: { like: Symbol.for("sequelize.like") },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Doctor: { count: jest.fn() },
    Specialities: {
        findAndCountAll: jest.fn(),
        count: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
    },
}));

const { Specialities } = await import("../../src/models/associations.js");
const { createAdminSpecialty } =
    await import("../../src/modules/admin/services/adminSpecialtyService.js");

describe("Admin specialty creation service", () => {
    beforeEach(() => jest.clearAllMocks());

    test("normalizes name and description and creates an active specialty", async () => {
        Specialities.findOne.mockResolvedValue(null);
        Specialities.create.mockResolvedValue({
            id: 12,
            name: "Medicina Interna",
            description: "Atención especializada.",
            is_active: true,
        });

        const result = await createAdminSpecialty({
            name: "  Medicina   Interna  ",
            description: " Atención especializada. ",
        });

        expect(Specialities.create).toHaveBeenCalledWith({
            name: "Medicina Interna",
            description: "Atención especializada.",
            is_active: true,
        });
        expect(result).toEqual({
            id: 12,
            name: "Medicina Interna",
            description: "Atención especializada.",
            isActive: true,
        });
    });

    test("stores an omitted description as null and returns an empty value", async () => {
        Specialities.findOne.mockResolvedValue(null);
        Specialities.create.mockResolvedValue({
            id: 7,
            name: "Pediatría",
            description: null,
            is_active: true,
        });

        const result = await createAdminSpecialty({ name: "Pediatría" });

        expect(Specialities.create).toHaveBeenCalledWith({
            name: "Pediatría",
            description: null,
            is_active: true,
        });
        expect(result.description).toBe("");
    });

    test("rejects duplicate names before attempting to create a record", async () => {
        Specialities.findOne.mockResolvedValue({ id: 1 });

        await expect(createAdminSpecialty({ name: "Medicina General" })).rejects.toMatchObject({
            statusCode: 409,
            message: "Ya existe una especialidad con ese nombre.",
        });
        expect(Specialities.create).not.toHaveBeenCalled();
    });

    test("maps a database uniqueness race to a duplicate-name response", async () => {
        Specialities.findOne.mockResolvedValue(null);
        Specialities.create.mockRejectedValue({ name: "SequelizeUniqueConstraintError" });

        await expect(createAdminSpecialty({ name: "Medicina General" })).rejects.toMatchObject({
            statusCode: 409,
        });
    });

    test.each([
        [null, "El nombre de la especialidad es obligatorio."],
        ["   ", "El nombre de la especialidad es obligatorio."],
        ["x".repeat(101), "El nombre no puede superar los 100 caracteres."],
    ])("rejects invalid name: %s", async (name, message) => {
        await expect(createAdminSpecialty({ name })).rejects.toMatchObject({
            statusCode: 400,
            message,
        });
        expect(Specialities.findOne).not.toHaveBeenCalled();
    });

    test("rejects invalid or oversized descriptions", async () => {
        await expect(
            createAdminSpecialty({ name: "Cardiología", description: 42 }),
        ).rejects.toMatchObject({ statusCode: 400 });
        await expect(
            createAdminSpecialty({ name: "Cardiología", description: "x".repeat(256) }),
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(Specialities.findOne).not.toHaveBeenCalled();
    });
});
