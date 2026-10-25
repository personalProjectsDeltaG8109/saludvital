import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("bcrypt", () => ({ default: { hash: jest.fn() } }));
jest.unstable_mockModule("sequelize", () => ({ Op: { or: Symbol("or"), like: Symbol("like") } }));
jest.unstable_mockModule("../../config/database.js", () => ({
    default: { transaction: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Doctor: { findAndCountAll: jest.fn(), count: jest.fn(), create: jest.fn() },
    DoctorAvailability: {},
    EmailOutbox: { create: jest.fn() },
    Rol: { findOne: jest.fn() },
    Specialities: { findOne: jest.fn(), findAll: jest.fn() },
    User: { findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/AuditLog.js", () => ({
    default: { create: jest.fn() },
}));

const bcrypt = (await import("bcrypt")).default;
const database = (await import("../../config/database.js")).default;
const { Doctor, EmailOutbox, Rol, Specialities, User } =
    await import("../../src/models/associations.js");
const AuditLog = (await import("../../src/models/AuditLog.js")).default;
const { createAdminDoctor, getAdminDoctors } =
    await import("../../src/modules/admin/services/adminDoctorService.js");

describe("Admin doctor management service", () => {
    beforeEach(() => jest.clearAllMocks());

    test("rejects invalid email before starting a transaction", async () => {
        await expect(
            createAdminDoctor(1, {
                email: "bad",
                password: "InitialPass1!",
                displayName: "Dr. Example",
                specialtyId: 2,
            }),
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(database.transaction).not.toHaveBeenCalled();
    });

    test("rejects an initial password that does not meet the account policy", async () => {
        await expect(
            createAdminDoctor(1, {
                email: "doctor@example.com",
                password: "weak-password",
                displayName: "Dr. Example",
                specialtyId: 2,
            }),
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(database.transaction).not.toHaveBeenCalled();
    });

    test("rejects a duplicate account email", async () => {
        database.transaction.mockImplementation((callback) => callback({}));
        Rol.findOne.mockResolvedValue({ id: 3 });
        Specialities.findOne.mockResolvedValue({ id: 2 });
        User.findOne.mockResolvedValue({ id: 9 });
        await expect(
            createAdminDoctor(1, {
                email: "EXISTING@example.com",
                password: "InitialPass1!",
                displayName: "Dr. Example",
                specialtyId: 2,
            }),
        ).rejects.toMatchObject({ statusCode: 409 });
        expect(User.create).not.toHaveBeenCalled();
    });

    test("only assigns an active specialty", async () => {
        database.transaction.mockImplementation((callback) => callback({}));
        Rol.findOne.mockResolvedValue({ id: 3 });
        Specialities.findOne.mockResolvedValue(null);
        User.findOne.mockResolvedValue(null);
        User.findByPk.mockResolvedValue({ id: 1, email: "admin@example.com" });

        await expect(
            createAdminDoctor(1, {
                email: "doctor@example.com",
                password: "InitialPass1!",
                displayName: "Dr. Example",
                specialtyId: 2,
            }),
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(User.create).not.toHaveBeenCalled();
    });

    test("creates a hashed doctor account and profile in one transaction", async () => {
        const transaction = {};
        database.transaction.mockImplementation((callback) => callback(transaction));
        Rol.findOne.mockResolvedValue({ id: 3 });
        Specialities.findOne.mockResolvedValue({ id: 2 });
        User.findOne.mockResolvedValue(null);
        bcrypt.hash.mockResolvedValue("secure-hash");
        User.create.mockResolvedValue({ id: 7 });
        Doctor.create.mockResolvedValue({ id: 12, display_name: "Dr. Example" });
        User.findByPk.mockResolvedValue({ id: 1, email: "admin@example.com" });
        EmailOutbox.create.mockResolvedValue({});
        AuditLog.create.mockResolvedValue({});

        await expect(
            createAdminDoctor(1, {
                email: "DOCTOR@example.com",
                password: "InitialPass1!",
                displayName: "Dr. Example",
                specialtyId: 2,
            }),
        ).resolves.toMatchObject({ id: 12 });
        expect(User.create).toHaveBeenCalledWith(
            expect.objectContaining({
                email: "doctor@example.com",
                password_hash: "secure-hash",
                role_id: 3,
            }),
            { transaction },
        );
        expect(Doctor.create).toHaveBeenCalledWith(
            expect.objectContaining({ user_id: 7, specialty_id: 2 }),
            { transaction },
        );
        expect(EmailOutbox.create).toHaveBeenCalledWith(
            expect.objectContaining({
                user_id: 7,
                event_type: "email_verification",
                status: "pending",
            }),
            { transaction },
        );
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({ action: "AdminDoctorCreated" }),
            { transaction },
        );
    });

    test("returns actual directory stats and specialty options", async () => {
        Doctor.findAndCountAll.mockResolvedValue({
            rows: [
                {
                    id: 2,
                    user_id: 7,
                    display_name: "Dr. Example",
                    specialty_id: 3,
                    user: { email: "doc@example.com", is_active: true },
                    specialty: { name: "Pediatrics" },
                    availability: [],
                },
            ],
            count: 1,
        });
        Doctor.count.mockResolvedValueOnce(4).mockResolvedValueOnce(3).mockResolvedValueOnce(2);
        Specialities.findAll.mockResolvedValue([{ id: 3, name: "Pediatrics" }]);
        await expect(getAdminDoctors()).resolves.toMatchObject({
            stats: { total: 4, active: 3, scheduled: 2, inactive: 1 },
            doctors: [{ name: "Dr. Example", hasSchedule: false }],
        });
        expect(Doctor.count).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({
                distinct: true,
                include: [expect.objectContaining({ as: "availability", required: true })],
            }),
        );
    });
});
