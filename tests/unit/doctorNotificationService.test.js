import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("../../config/database.js", () => ({
    default: { query: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    AppointmentHistory: { findAndCountAll: jest.fn(), findOne: jest.fn() },
    Doctor: { findOne: jest.fn() },
    DoctorAppointmentNotificationRead: { findOrCreate: jest.fn() },
}));

const database = (await import("../../config/database.js")).default;
const models = await import("../../src/models/associations.js");
const {
    getDoctorNotifications,
    getDoctorUnreadNotificationCount,
    markAllDoctorNotificationsRead,
    markDoctorNotificationRead,
} = await import("../../src/modules/doctor/services/doctorNotificationService.js");

describe("doctor notification service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        models.Doctor.findOne.mockResolvedValue({ id: 7 });
        models.AppointmentHistory.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
        database.query.mockResolvedValue([{ unreadCount: 0 }]);
        models.AppointmentHistory.findOne.mockResolvedValue({ id: 21 });
        models.DoctorAppointmentNotificationRead.findOrCreate.mockResolvedValue([{}, true]);
    });

    test("returns only supported appointment events assigned to the signed-in doctor", async () => {
        models.AppointmentHistory.findAndCountAll.mockResolvedValue({
            count: 2,
            rows: [
                {
                    id: 21,
                    event_type: "Rescheduled",
                    occurred_at: new Date("2026-11-02T15:00:00.000Z"),
                    appointment: { start_at: new Date("2026-11-05T15:00:00.000Z") },
                    doctorReadStates: [],
                },
                {
                    id: 20,
                    event_type: "Cancelled",
                    occurred_at: new Date("2026-11-01T15:00:00.000Z"),
                    appointment: { start_at: new Date("2026-11-04T15:00:00.000Z") },
                    doctorReadStates: [{ id: 2 }],
                },
            ],
        });
        database.query.mockResolvedValue([{ unreadCount: 1 }]);

        const result = await getDoctorNotifications(42, { page: "1" });

        expect(models.Doctor.findOne).toHaveBeenCalledWith({
            where: { user_id: 42 },
            attributes: ["id"],
        });
        expect(models.AppointmentHistory.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { event_type: ["Created", "Rescheduled", "Cancelled"] },
                limit: 20,
                offset: 0,
                distinct: true,
                include: expect.arrayContaining([
                    expect.objectContaining({
                        association: "appointment",
                        where: { doctor_id: 7 },
                        required: true,
                    }),
                    expect.objectContaining({
                        association: "doctorReadStates",
                        where: { doctor_id: 7 },
                    }),
                ]),
            }),
        );
        expect(result).toMatchObject({
            totalItems: 2,
            unreadCount: 1,
            items: [
                { id: 21, label: "Cita reprogramada", isRead: false },
                { id: 20, label: "Cita cancelada", isRead: true },
            ],
        });
        expect(JSON.stringify(result)).not.toMatch(/patient|reason|phone|email|token|secret/i);
    });

    test("rejects invalid pagination values", async () => {
        await expect(getDoctorNotifications(42, { page: "-1" })).rejects.toMatchObject({
            statusCode: 400,
        });
        expect(models.AppointmentHistory.findAndCountAll).not.toHaveBeenCalled();
    });

    test("propagates database failures without returning partial notification data", async () => {
        database.query.mockRejectedValue(new Error("Database unavailable"));

        await expect(getDoctorNotifications(42)).rejects.toThrow("Database unavailable");
    });

    test("counts unread events with a doctor-scoped database query", async () => {
        database.query.mockResolvedValue([{ unreadCount: "3" }]);

        await expect(getDoctorUnreadNotificationCount(42)).resolves.toBe(3);

        expect(database.query).toHaveBeenCalledWith(
            expect.stringContaining("appointment.doctor_id = :doctorId"),
            expect.objectContaining({
                replacements: { doctorId: 7, eventTypes: ["Created", "Rescheduled", "Cancelled"] },
            }),
        );
    });

    test("marks an assigned appointment event as read idempotently", async () => {
        await expect(markDoctorNotificationRead(42, "21")).resolves.toEqual({
            id: 21,
            isRead: true,
        });

        expect(models.AppointmentHistory.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 21, event_type: ["Created", "Rescheduled", "Cancelled"] },
                include: [expect.objectContaining({ where: { doctor_id: 7 }, required: true })],
            }),
        );
        expect(models.DoctorAppointmentNotificationRead.findOrCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { doctor_id: 7, appointment_history_id: 21 },
                defaults: { read_at: expect.any(Date) },
            }),
        );
    });

    test("marks all unread appointment events for the signed-in doctor as read", async () => {
        database.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ unreadCount: 0 }]);

        await expect(markAllDoctorNotificationsRead(42)).resolves.toEqual({ unreadCount: 0 });

        expect(database.query).toHaveBeenNthCalledWith(
            1,
            expect.stringContaining("INSERT IGNORE INTO doctor_appointment_notification_reads"),
            {
                replacements: {
                    doctorId: 7,
                    eventTypes: ["Created", "Rescheduled", "Cancelled"],
                },
            },
        );
        expect(database.query.mock.calls[0][0]).toContain("appointment.doctor_id = :doctorId");
    });

    test("does not mark a missing or differently assigned event as read", async () => {
        models.AppointmentHistory.findOne.mockResolvedValue(null);

        await expect(markDoctorNotificationRead(42, 21)).rejects.toMatchObject({ statusCode: 404 });
        expect(models.DoctorAppointmentNotificationRead.findOrCreate).not.toHaveBeenCalled();
    });
});
