import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("sequelize", () => ({
    Op: { like: Symbol.for("sequelize.like"), ne: Symbol.for("sequelize.ne") },
}));
jest.unstable_mockModule("../../config/database.js", () => ({
    default: { transaction: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Doctor: { count: jest.fn() },
    User: { findByPk: jest.fn() },
    Specialities: {
        findAndCountAll: jest.fn(),
        count: jest.fn(),
        findOne: jest.fn(),
        findByPk: jest.fn(),
        create: jest.fn(),
    },
}));
jest.unstable_mockModule("../../src/models/AuditLog.js", () => ({
    default: { create: jest.fn() },
}));

const { Specialities, User } = await import("../../src/models/associations.js");
const database = (await import("../../config/database.js")).default;
const AuditLog = (await import("../../src/models/AuditLog.js")).default;
const {
    createAdminSpecialty,
    getAdminSpecialtyForEdit,
    updateAdminSpecialty,
    updateAdminSpecialtyStatus,
} = await import("../../src/modules/admin/services/adminSpecialtyService.js");

describe("Admin specialty creation service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        database.transaction.mockImplementation((callback) =>
            callback({ LOCK: { UPDATE: "UPDATE" } }),
        );
    });

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

    test("loads only the existing fields needed by the edit form", async () => {
        Specialities.findByPk.mockResolvedValue({
            id: 5,
            name: "Pediatría",
            description: "Atención infantil.",
            is_active: false,
        });

        await expect(getAdminSpecialtyForEdit("5")).resolves.toEqual({
            id: 5,
            name: "Pediatría",
            description: "Atención infantil.",
            isActive: false,
        });
        expect(Specialities.findByPk).toHaveBeenCalledWith(5, {
            attributes: ["id", "name", "description", "is_active"],
        });
    });

    test("updates name and description and audits their previous and next values", async () => {
        const specialty = {
            id: 5,
            name: "Pediatría",
            description: "Atención infantil.",
            is_active: false,
            update: jest
                .fn()
                .mockImplementation(async (changes) => Object.assign(specialty, changes)),
        };
        Specialities.findByPk.mockResolvedValue(specialty);
        Specialities.findOne.mockResolvedValue(null);
        User.findByPk.mockResolvedValue({ id: 9, email: "admin@example.com" });
        AuditLog.create.mockResolvedValue({ id: 22 });

        const result = await updateAdminSpecialty("9", "5", {
            name: "  Neurología  ",
            description: "Atención del sistema nervioso.",
        });

        expect(specialty.update).toHaveBeenCalledWith(
            { name: "Neurología", description: "Atención del sistema nervioso." },
            expect.objectContaining({ transaction: expect.any(Object) }),
        );
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                actor_user_id: 9,
                action: "AdminSpecialtyUpdated",
                target_type: "MedicalSpecialty",
                target_id: "5",
                changes: {
                    name: { previous: "Pediatría", next: "Neurología" },
                    description: {
                        previous: "Atención infantil.",
                        next: "Atención del sistema nervioso.",
                    },
                },
            }),
            expect.objectContaining({ transaction: expect.any(Object) }),
        );
        expect(result).toEqual({
            id: 5,
            name: "Neurología",
            description: "Atención del sistema nervioso.",
            isActive: false,
        });
    });

    test("allows the specialty to keep its own name and skips an empty audit", async () => {
        const specialty = {
            id: 5,
            name: "Pediatría",
            description: null,
            is_active: true,
            update: jest.fn(),
        };
        Specialities.findByPk.mockResolvedValue(specialty);
        Specialities.findOne.mockResolvedValue(null);
        User.findByPk.mockResolvedValue({ id: 9, email: "admin@example.com" });

        const result = await updateAdminSpecialty("9", 5, { name: "Pediatría" });

        expect(Specialities.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    name: "Pediatría",
                    id: { [Symbol.for("sequelize.ne")]: 5 },
                },
            }),
        );
        expect(specialty.update).not.toHaveBeenCalled();
        expect(AuditLog.create).not.toHaveBeenCalled();
        expect(result.isActive).toBe(true);
    });

    test("rejects duplicate specialty names without changing the record", async () => {
        const specialty = { id: 5, name: "Pediatría", update: jest.fn() };
        Specialities.findByPk.mockResolvedValue(specialty);
        Specialities.findOne.mockResolvedValue({ id: 6 });

        await expect(
            updateAdminSpecialty("9", 5, { name: "Medicina General" }),
        ).rejects.toMatchObject({ statusCode: 409 });
        expect(specialty.update).not.toHaveBeenCalled();
        expect(AuditLog.create).not.toHaveBeenCalled();
    });

    test("returns not found for invalid and missing specialty identifiers", async () => {
        await expect(getAdminSpecialtyForEdit("0")).rejects.toMatchObject({ statusCode: 404 });
        Specialities.findByPk.mockResolvedValue(null);
        await expect(getAdminSpecialtyForEdit("99")).rejects.toMatchObject({
            statusCode: 404,
            message: "No encontramos esa especialidad.",
        });
    });

    test("deactivates without removing existing specialty relationships and records an audit", async () => {
        const specialty = {
            id: 5,
            name: "PediatrÃ­a",
            is_active: true,
            update: jest
                .fn()
                .mockImplementation(async (changes) => Object.assign(specialty, changes)),
        };
        Specialities.findByPk.mockResolvedValue(specialty);
        User.findByPk.mockResolvedValue({ id: 9, email: "admin@example.com" });
        AuditLog.create.mockResolvedValue({ id: 23 });

        await expect(updateAdminSpecialtyStatus(9, "5", false)).resolves.toEqual({
            id: 5,
            name: "PediatrÃ­a",
            isActive: false,
        });
        expect(specialty.update).toHaveBeenCalledWith(
            { is_active: false },
            expect.objectContaining({ transaction: expect.any(Object) }),
        );
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "AdminSpecialtyDeactivated",
                target_type: "MedicalSpecialty",
                target_id: "5",
                changes: {
                    previous: { isActive: true },
                    next: { isActive: false },
                },
            }),
            expect.objectContaining({ transaction: expect.any(Object) }),
        );
    });

    test("reactivates an inactive specialty", async () => {
        const specialty = {
            id: 6,
            name: "NeurologÃ­a",
            is_active: false,
            update: jest.fn(),
        };
        Specialities.findByPk.mockResolvedValue(specialty);
        User.findByPk.mockResolvedValue({ id: 9, email: "admin@example.com" });

        await expect(updateAdminSpecialtyStatus(9, 6, true)).resolves.toMatchObject({
            id: 6,
            isActive: true,
        });
        expect(specialty.update).toHaveBeenCalledWith(
            { is_active: true },
            expect.objectContaining({ transaction: expect.any(Object) }),
        );
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({ action: "AdminSpecialtyActivated" }),
            expect.any(Object),
        );
    });

    test("rejects invalid states and repeated status changes", async () => {
        await expect(updateAdminSpecialtyStatus(9, 5, "false")).rejects.toMatchObject({
            statusCode: 400,
        });
        const specialty = { id: 5, name: "PediatrÃ­a", is_active: false, update: jest.fn() };
        Specialities.findByPk.mockResolvedValue(specialty);
        User.findByPk.mockResolvedValue({ id: 9, email: "admin@example.com" });

        await expect(updateAdminSpecialtyStatus(9, 5, false)).rejects.toMatchObject({
            statusCode: 409,
        });
        expect(specialty.update).not.toHaveBeenCalled();
        expect(AuditLog.create).not.toHaveBeenCalled();
    });
});
