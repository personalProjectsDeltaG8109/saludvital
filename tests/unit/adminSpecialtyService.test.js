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
    },
}));
jest.unstable_mockModule("../../src/models/AuditLog.js", () => ({
    default: { create: jest.fn() },
}));

const { Doctor, Specialities } = await import("../../src/models/associations.js");
const { getAdminSpecialties } =
    await import("../../src/modules/admin/services/adminSpecialtyService.js");

describe("Admin specialty service", () => {
    beforeEach(() => jest.clearAllMocks());

    test("returns database specialties, assignment counts, and summary statistics", async () => {
        Specialities.findAndCountAll.mockResolvedValue({
            rows: [
                {
                    id: 4,
                    name: "Pediatría",
                    description: "Atención médica infantil.",
                    is_active: true,
                },
            ],
            count: 1,
        });
        Specialities.count.mockResolvedValueOnce(8).mockResolvedValueOnce(6);
        Doctor.count.mockResolvedValueOnce(12).mockResolvedValueOnce([
            { specialty_id: 4, count: 5 },
            { specialty_id: 9, count: 7 },
        ]);

        const result = await getAdminSpecialties({
            search: "  pedi ",
            status: "active",
            page: "2",
            pageSize: "25",
        });

        expect(Specialities.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    name: { [Symbol.for("sequelize.like")]: "%pedi%" },
                    is_active: true,
                }),
                limit: 25,
                offset: 25,
            }),
        );
        expect(result).toEqual({
            specialties: [
                {
                    id: 4,
                    name: "Pediatría",
                    description: "Atención médica infantil.",
                    isActive: true,
                    doctorCount: 5,
                },
            ],
            stats: { total: 8, active: 6, inactive: 2, assignedDoctors: 12 },
            pagination: { page: 2, pageSize: 25, totalItems: 1, totalPages: 1 },
        });
    });

    test("uses an empty description and zero assignments when data is missing", async () => {
        Specialities.findAndCountAll.mockResolvedValue({
            rows: [{ id: 1, name: "General", description: null, is_active: false }],
            count: 1,
        });
        Specialities.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
        Doctor.count.mockResolvedValueOnce(0).mockResolvedValueOnce([]);

        const result = await getAdminSpecialties();

        expect(result.specialties[0]).toMatchObject({
            description: "",
            isActive: false,
            doctorCount: 0,
        });
        expect(result.pagination).toEqual({ page: 1, pageSize: 10, totalItems: 1, totalPages: 1 });
    });

    test("rejects unsupported status and page size before querying the database", async () => {
        await expect(getAdminSpecialties({ status: "deleted" })).rejects.toMatchObject({
            statusCode: 400,
        });
        await expect(getAdminSpecialties({ pageSize: "50" })).rejects.toMatchObject({
            statusCode: 400,
        });

        expect(Specialities.findAndCountAll).not.toHaveBeenCalled();
    });

    test("limits the search length and page number", async () => {
        await expect(getAdminSpecialties({ search: "x".repeat(101) })).rejects.toMatchObject({
            statusCode: 400,
        });
        await expect(getAdminSpecialties({ page: "0" })).rejects.toMatchObject({
            statusCode: 400,
        });
        expect(Specialities.findAndCountAll).not.toHaveBeenCalled();
    });
});
