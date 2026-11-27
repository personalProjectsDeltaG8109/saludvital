import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const transaction = { LOCK: { UPDATE: "UPDATE" } };

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
    Doctor: { findAndCountAll: jest.fn(), findByPk: jest.fn(), count: jest.fn() },
    DoctorAvailability: { findAll: jest.fn() },
    Rol: { findOne: jest.fn(), findByPk: jest.fn() },
    Specialities: { findAll: jest.fn() },
    User: { findByPk: jest.fn() },
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

const database = (await import("../../config/database.js")).default;
const { Doctor, DoctorAvailability, Rol, Specialities, User } =
    await import("../../src/models/associations.js");
const { getAdminDoctorDetails, getAdminDoctors, updateAdminDoctorStatus } =
    await import("../../src/modules/admin/services/adminDoctorService.js");

describe("Admin doctor management service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        database.transaction.mockImplementation(async (callback) => callback(transaction));
    });

    test("returns persisted doctor counts, records, and active specialties", async () => {
        Rol.findOne.mockResolvedValue({ id: 4 });
        Doctor.findAndCountAll.mockResolvedValue({
            rows: [
                {
                    id: 2,
                    user_id: 7,
                    display_name: null,
                    profile_review_status: "pending",
                    user: {
                        email: "doctor@example.com",
                        display_name: "Dra. Example",
                        is_active: false,
                        profile_photo_url: "/uploads/profile-photos/doctor-from-user.webp",
                    },
                    profile_photo_url: null,
                    specialty: { name: "Pediatría" },
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
        Specialities.findAll.mockResolvedValue([{ id: 3, name: "Pediatría" }]);

        await expect(getAdminDoctors()).resolves.toMatchObject({
            stats: { total: 4, active: 3, scheduled: 2, inactive: 1 },
            doctors: [
                {
                    userId: 7,
                    name: "Dra. Example",
                    profileReviewStatus: "pending",
                    hasSchedule: false,
                    profilePhotoUrl: "/uploads/profile-photos/doctor-from-user.webp",
                },
            ],
            specialties: [{ id: 3, name: "Pediatría" }],
        });
    });

    test("returns approved profile details without exposing account secrets", async () => {
        Doctor.findByPk.mockResolvedValue({
            id: 12,
            user_id: 7,
            display_name: "Dra. Example",
            first_name: "Ana",
            last_name: "Torres",
            document_type: "CC",
            document_number: "123456789",
            professional_registration_number: "RM-12345",
            profile_review_status: "approved",
            profile_photo_url: null,
            created_at: "2026-10-20T12:00:00.000Z",
            user: {
                id: 7,
                email: "doctor@example.com",
                phone: "3001234567",
                profile_photo_url: "/uploads/profile-photos/doctor-account.webp",
                email_verified_at: "2026-10-20T12:00:00.000Z",
                is_active: true,
                created_at: "2026-10-19T12:00:00.000Z",
                last_login_at: null,
            },
            specialty: { id: 3, name: "Medicina General" },
        });
        DoctorAvailability.findAll.mockResolvedValue([]);

        await expect(getAdminDoctorDetails("12")).resolves.toMatchObject({
            firstName: "Ana",
            lastName: "Torres",
            documentType: "CC",
            documentNumber: "123456789",
            professionalRegistrationNumber: "RM-12345",
            phone: "3001234567",
            emailVerified: true,
            profileReviewStatus: "approved",
            profilePhotoUrl: "/uploads/profile-photos/doctor-account.webp",
        });
        expect(Doctor.findByPk).toHaveBeenCalledWith(
            12,
            expect.objectContaining({
                attributes: expect.not.arrayContaining([
                    "password_hash",
                    "email_verification_token_hash",
                ]),
            }),
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

    test("returns not found for a missing doctor", async () => {
        Doctor.findByPk.mockResolvedValue(null);
        await expect(getAdminDoctorDetails("12")).rejects.toMatchObject({ statusCode: 404 });
    });

    test("does not activate a doctor profile before administrator approval", async () => {
        const user = {
            id: 7,
            role_id: 4,
            email: "doctor@example.com",
            is_active: false,
            update: jest.fn(),
        };
        Doctor.findByPk.mockResolvedValue({
            id: 12,
            user_id: 7,
            profile_review_status: "pending",
        });
        User.findByPk.mockResolvedValue(user);
        Rol.findByPk.mockResolvedValue({ name: "Doctor" });

        await expect(updateAdminDoctorStatus(1, 12, true)).rejects.toMatchObject({
            statusCode: 409,
            message: "El perfil del m\u00e9dico debe aprobarse antes de activar su cuenta.",
        });
        expect(user.update).not.toHaveBeenCalled();
    });

    test("returns not found for an invalid doctor identifier", async () => {
        await expect(getAdminDoctorDetails("invalid")).rejects.toMatchObject({ statusCode: 404 });
        expect(Doctor.findByPk).not.toHaveBeenCalled();
    });
});
