import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("bcrypt", () => ({ default: { hash: jest.fn() } }));
jest.unstable_mockModule("sequelize", () => ({
    Op: { gt: Symbol("gt"), or: Symbol("or"), like: Symbol("like") },
}));
jest.unstable_mockModule("../../config/database.js", () => ({
    default: { transaction: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: { findAll: jest.fn() },
    AppointmentHistory: { create: jest.fn() },
    AppointmentStatus: { findOne: jest.fn() },
    Doctor: {
        findAndCountAll: jest.fn(),
        findByPk: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
    },
    DoctorAvailability: { findAll: jest.fn() },
    EmailOutbox: { create: jest.fn() },
    Rol: { findOne: jest.fn() },
    Specialities: { findOne: jest.fn(), findAll: jest.fn() },
    User: { findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
}));
jest.unstable_mockModule(
    "../../src/modules/patient/services/notificationAutomationService.js",
    () => ({
        cancelPendingAppointmentReminders: jest.fn(),
        enqueueAppointmentNotifications: jest.fn(),
    }),
);
jest.unstable_mockModule("../../src/models/AuditLog.js", () => ({
    default: { create: jest.fn() },
}));
jest.unstable_mockModule("../../src/shared/services/profilePhotoStorageService.js", () => ({
    storeProfilePhoto: jest.fn(),
    removeStoredProfilePhoto: jest.fn(),
}));
jest.unstable_mockModule("../../src/shared/utils/colombiaCalendarDate.js", () => ({
    getColombiaCalendarDate: jest.fn(() => "2026-11-27"),
}));

const bcrypt = (await import("bcrypt")).default;
const database = (await import("../../config/database.js")).default;
const { Doctor, DoctorAvailability, EmailOutbox, Rol, Specialities, User } =
    await import("../../src/models/associations.js");
const AuditLog = (await import("../../src/models/AuditLog.js")).default;
const profilePhotoStorageService =
    await import("../../src/shared/services/profilePhotoStorageService.js");
const { createAdminDoctor, getAdminDoctorDetails, getAdminDoctors } =
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

    test("rejects an initial password longer than 50 characters", async () => {
        await expect(
            createAdminDoctor(1, {
                email: "doctor@example.com",
                password: `InitialPass1!${"x".repeat(40)}`,
                displayName: "Dr. Example",
                specialtyId: 2,
            }),
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(database.transaction).not.toHaveBeenCalled();
    });

    test("accepts account emails longer than the former 100-character limit", async () => {
        const transaction = {};
        const email = `${"a".repeat(110)}@example.com`;
        database.transaction.mockImplementation((callback) => callback(transaction));
        Rol.findOne.mockResolvedValue({ id: 3 });
        Specialities.findOne.mockResolvedValue({ id: 2 });
        User.findOne.mockResolvedValue(null);
        User.findByPk.mockResolvedValue({ id: 1, email: "admin@example.com" });
        bcrypt.hash.mockResolvedValue("secure-hash");
        User.create.mockResolvedValue({ id: 7 });
        Doctor.create.mockResolvedValue({ id: 12 });
        EmailOutbox.create.mockResolvedValue({});
        AuditLog.create.mockResolvedValue({});

        await createAdminDoctor(1, {
            email,
            password: "InitialPass1!",
            displayName: "Dr. Example",
            specialtyId: 2,
        });

        expect(User.create).toHaveBeenCalledWith(
            expect.objectContaining({ email }),
            expect.objectContaining({ transaction }),
        );
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

    test("saves an optional profile photo with the new doctor", async () => {
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
        profilePhotoStorageService.storeProfilePhoto.mockResolvedValue(
            "/uploads/profile-photos/doctor.png",
        );

        await createAdminDoctor(1, {
            email: "doctor@example.com",
            password: "InitialPass1!",
            displayName: "Dr. Example",
            specialtyId: 2,
            photo: "data:image/png;base64,valid-photo-data",
        });

        expect(profilePhotoStorageService.storeProfilePhoto).toHaveBeenCalledWith(
            "data:image/png;base64,valid-photo-data",
        );
        expect(Doctor.create).toHaveBeenCalledWith(
            expect.objectContaining({ profile_photo_url: "/uploads/profile-photos/doctor.png" }),
            { transaction },
        );
    });

    test("removes a saved photo if creating the doctor transaction fails", async () => {
        database.transaction.mockImplementation(async (callback) => callback({}));
        Rol.findOne.mockResolvedValue({ id: 3 });
        Specialities.findOne.mockResolvedValue({ id: 2 });
        User.findOne.mockResolvedValue(null);
        User.findByPk.mockResolvedValue({ id: 1, email: "admin@example.com" });
        bcrypt.hash.mockResolvedValue("secure-hash");
        User.create.mockResolvedValue({ id: 7 });
        profilePhotoStorageService.storeProfilePhoto.mockResolvedValue(
            "/uploads/profile-photos/doctor.png",
        );
        Doctor.create.mockRejectedValue(new Error("database failure"));

        await expect(
            createAdminDoctor(1, {
                email: "doctor@example.com",
                password: "InitialPass1!",
                displayName: "Dr. Example",
                specialtyId: 2,
                photo: "data:image/png;base64,valid-photo-data",
            }),
        ).rejects.toThrow("database failure");
        expect(profilePhotoStorageService.removeStoredProfilePhoto).toHaveBeenCalledWith(
            "/uploads/profile-photos/doctor.png",
        );
    });

    test("returns actual directory stats and specialty options", async () => {
        Rol.findOne.mockResolvedValue({ id: 4 });
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
        Doctor.count
            .mockResolvedValueOnce(4)
            .mockResolvedValueOnce(3)
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(2);
        Specialities.findAll.mockResolvedValue([{ id: 3, name: "Pediatrics" }]);
        await expect(getAdminDoctors()).resolves.toMatchObject({
            stats: { total: 4, active: 3, scheduled: 2, inactive: 1 },
            doctors: [{ userId: 7, name: "Dr. Example", hasSchedule: false }],
        });
        expect(Doctor.count).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                distinct: true,
                include: [
                    expect.objectContaining({
                        as: "user",
                        where: { is_active: true, role_id: 4 },
                        required: true,
                    }),
                ],
            }),
        );
        expect(Doctor.count).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({
                distinct: true,
                include: [
                    expect.objectContaining({
                        as: "user",
                        where: { is_active: false, role_id: 4 },
                        required: true,
                    }),
                ],
            }),
        );
        expect(Doctor.count).toHaveBeenNthCalledWith(
            4,
            expect.objectContaining({
                distinct: true,
                include: expect.arrayContaining([
                    expect.objectContaining({ as: "availability", required: true }),
                    expect.objectContaining({
                        as: "user",
                        where: { role_id: 4 },
                        required: true,
                    }),
                ]),
            }),
        );
    });

    test("returns safe doctor details and the existing availability blocks", async () => {
        Doctor.findByPk.mockResolvedValue({
            id: 12,
            user_id: 7,
            display_name: "Dr. Example",
            professional_information: "Medicina familiar",
            profile_photo_url: "/uploads/profile-photos/example.png",
            created_at: "2026-10-20T12:00:00.000Z",
            user: {
                id: 7,
                email: "doctor@example.com",
                is_active: true,
                created_at: "2026-10-19T12:00:00.000Z",
                last_login_at: "2026-10-21T12:00:00.000Z",
                password_hash: "must-not-be-returned",
            },
            specialty: { id: 3, name: "Medicina General" },
        });
        DoctorAvailability.findAll.mockResolvedValue([
            {
                id: 5,
                day_of_week: 1,
                start_time: "08:30:00",
                end_time: "12:00:00",
                valid_from: "2026-10-01",
                valid_until: null,
                is_active: true,
            },
            {
                id: 6,
                day_of_week: 3,
                start_time: "13:00:00",
                end_time: "17:00:00",
                valid_from: "2026-10-01",
                valid_until: "2026-12-31",
                is_active: false,
            },
        ]);

        await expect(getAdminDoctorDetails("12")).resolves.toMatchObject({
            id: 12,
            userId: 7,
            name: "Dr. Example",
            email: "doctor@example.com",
            specialty: { id: 3, name: "Medicina General" },
            isActive: true,
            hasSchedule: true,
            schedule: [
                { day: "Lunes", startTime: "08:30", endTime: "12:00", isActive: true },
                { day: "Miércoles", isActive: false },
            ],
        });
        expect(Doctor.findByPk).toHaveBeenCalledWith(
            12,
            expect.objectContaining({
                attributes: expect.not.arrayContaining(["password_hash", "token"]),
            }),
        );
        expect(DoctorAvailability.findAll).toHaveBeenCalledWith(
            expect.objectContaining({ where: { doctor_id: 12 } }),
        );
    });

    test("groups active, upcoming, and previous availability by weekday", async () => {
        Doctor.findByPk.mockResolvedValue({
            id: 12,
            user_id: 7,
            display_name: "Dr. Example",
            profile_photo_url: null,
            user: {
                id: 7,
                email: "doctor@example.com",
                is_active: true,
            },
            specialty: { id: 3, name: "Medicina General" },
        });
        DoctorAvailability.findAll.mockResolvedValue([
            {
                id: 1,
                day_of_week: 1,
                start_time: "13:00:00",
                end_time: "17:00:00",
                valid_from: "2026-01-01",
                valid_until: null,
                is_active: true,
            },
            {
                id: 2,
                day_of_week: 1,
                start_time: "08:30:00",
                end_time: "12:00:00",
                valid_from: "2026-01-01",
                valid_until: null,
                is_active: true,
            },
            {
                id: 3,
                day_of_week: 2,
                start_time: "09:00:00",
                end_time: "12:00:00",
                valid_from: "2026-11-30",
                valid_until: null,
                is_active: true,
            },
            {
                id: 4,
                day_of_week: 3,
                start_time: "08:00:00",
                end_time: "09:00:00",
                valid_from: "2026-01-01",
                valid_until: null,
                is_active: false,
            },
            {
                id: 5,
                day_of_week: 4,
                start_time: "08:00:00",
                end_time: "09:00:00",
                valid_from: "2026-01-01",
                valid_until: "2026-11-26",
                is_active: true,
            },
        ]);

        const details = await getAdminDoctorDetails("12");

        expect(details.currentSchedule).toHaveLength(7);
        expect(details.currentSchedule[0]).toMatchObject({
            dayOfWeek: 1,
            intervals: [
                { id: 2, timeRange: "8:30 a. m. – 12:00 p. m." },
                { id: 1, timeRange: "1:00 p. m. – 5:00 p. m." },
            ],
        });
        expect(details.currentSchedule[1]).toMatchObject({ dayOfWeek: 2, intervals: [] });
        expect(details.upcomingSchedule).toEqual([
            expect.objectContaining({
                dayOfWeek: 2,
                periods: [
                    expect.objectContaining({
                        validityLabel: "Desde 30 de nov de 2026",
                        status: "Programado",
                    }),
                ],
            }),
        ]);
        expect(details.previousSchedule).toEqual([
            expect.objectContaining({
                dayOfWeek: 3,
                periods: [expect.objectContaining({ status: "Inactivo" })],
            }),
            expect.objectContaining({
                dayOfWeek: 4,
                periods: [expect.objectContaining({ status: "Vencido" })],
            }),
        ]);
        expect(details.schedule).toHaveLength(5);
    });

    test("does not show only expired availability as a configured schedule", async () => {
        Doctor.findByPk.mockResolvedValue({
            id: 12,
            user_id: 7,
            display_name: "Dr. Example",
            profile_photo_url: null,
            user: { id: 7, email: "doctor@example.com", is_active: true },
            specialty: null,
        });
        DoctorAvailability.findAll.mockResolvedValue([
            {
                id: 8,
                day_of_week: 1,
                start_time: "08:00:00",
                end_time: "09:00:00",
                valid_from: "2026-01-01",
                valid_until: "2026-11-26",
                is_active: true,
            },
        ]);

        const details = await getAdminDoctorDetails("12");

        expect(details.hasSchedule).toBe(false);
        expect(details.currentSchedule).toHaveLength(7);
        expect(details.currentSchedule.every((day) => day.intervals.length === 0)).toBe(true);
        expect(details.previousSchedule[0].periods[0].status).toBe("Vencido");
    });

    test("returns not found for a missing or invalid doctor id", async () => {
        Doctor.findByPk.mockResolvedValue(null);

        await expect(getAdminDoctorDetails("invalid")).rejects.toMatchObject({ statusCode: 404 });
        await expect(getAdminDoctorDetails("42")).rejects.toMatchObject({ statusCode: 404 });
        expect(DoctorAvailability.findAll).not.toHaveBeenCalled();
    });
});
