import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Op } from "sequelize";

jest.unstable_mockModule("../../../config/database.js", () => ({ default: {} }));
jest.unstable_mockModule("../../../src/models/associations.js", () => ({
    AppointmentHistory: { findAll: jest.fn() },
    Notification: { count: jest.fn(), findAll: jest.fn(), update: jest.fn() },
    NotificationPreference: { findAll: jest.fn() },
    Patient: { findOne: jest.fn() },
}));

const { AppointmentHistory, Notification, NotificationPreference, Patient } =
    await import("../../../src/models/associations.js");
const {
    getPatientNotificationSettings,
    getPatientUnreadNotificationCount,
    markPatientNotificationsAsRead,
} = await import("../../../src/modules/patient/services/notificationService.js");

describe("patient notification read state", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Patient.findOne.mockResolvedValue({
            id: 17,
            user: { email: "patient@example.com" },
            get: () => ({ id: 17 }),
        });
        Notification.count.mockResolvedValue(3);
        Notification.update.mockResolvedValue([2]);
        AppointmentHistory.findAll.mockResolvedValue([]);
    });

    test("counts unread notifications only for the authenticated patient's profile", async () => {
        await expect(getPatientUnreadNotificationCount(91)).resolves.toBe(3);
        expect(Patient.findOne).toHaveBeenCalledWith({
            where: { user_id: 91 },
            attributes: ["id"],
        });
        expect(Notification.count).toHaveBeenCalledWith({
            where: { patient_id: 17, read_at: null },
        });
    });

    test("marks only requested unread records belonging to the authenticated patient", async () => {
        await expect(markPatientNotificationsAsRead(91, [4, 5])).resolves.toEqual({
            unreadCount: 3,
        });
        expect(Notification.update).toHaveBeenCalledWith(
            { read_at: expect.any(Date) },
            {
                where: {
                    patient_id: 17,
                    id: { [Op.in]: [4, 5] },
                    read_at: null,
                },
            },
        );
    });

    test.each([[[]], [[0]], [[1, 1]], [[...Array(21)].map((_, index) => index + 1)]])(
        "rejects invalid or oversized notification selections",
        async (ids) => {
            await expect(markPatientNotificationsAsRead(91, ids)).rejects.toMatchObject({
                status: 400,
            });
            expect(Notification.update).not.toHaveBeenCalled();
        },
    );

    test("marks only the first two visible history records as read", async () => {
        const history = [
            {
                id: 4,
                event_type: "appointment_reminder",
                channel: "SMS",
                status: "Sent",
                scheduled_at: new Date(),
            },
            {
                id: 5,
                event_type: "appointment_reminder",
                channel: "SMS",
                status: "Sent",
                scheduled_at: new Date(),
            },
            {
                id: 6,
                event_type: "appointment_reminder",
                channel: "SMS",
                status: "Sent",
                scheduled_at: new Date(),
            },
        ];
        NotificationPreference.findAll.mockResolvedValue([]);
        Notification.findAll.mockResolvedValue(history);

        await getPatientNotificationSettings(91, { markVisibleAsRead: true });

        expect(Notification.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                attributes: expect.arrayContaining(["read_at"]),
                where: { patient_id: 17 },
                limit: 20,
            }),
        );
        expect(Notification.update).toHaveBeenCalledWith(
            { read_at: expect.any(Date) },
            expect.objectContaining({ where: expect.objectContaining({ patient_id: 17 }) }),
        );
        expect(Notification.update.mock.calls[0][1].where.id[Op.in]).toEqual([4, 5]);
    });

    test.each(["Created", "Rescheduled", "Cancelled"])(
        "includes the patient's persisted %s appointment event without creating a provider notification",
        async (eventType) => {
            const occurredAt = new Date("2026-11-03T15:00:00.000Z");
            const appointmentEvent = {
                id: 28,
                event_type: eventType,
                previous_values:
                    eventType === "Cancelled"
                        ? { start_at: "2026-11-08T15:00:00.000Z", reason: "private" }
                        : null,
                new_values:
                    eventType === "Cancelled"
                        ? { status: "Cancelled" }
                        : { start_at: "2026-11-08T16:00:00.000Z", reason: "private" },
                occurred_at: occurredAt,
                appointment: { id: 54, start_at: new Date("2026-11-08T16:00:00.000Z") },
            };
            AppointmentHistory.findAll.mockResolvedValue([appointmentEvent]);
            NotificationPreference.findAll.mockResolvedValue([]);
            Notification.findAll.mockResolvedValue([]);

            const result = await getPatientNotificationSettings(91);

            expect(AppointmentHistory.findAll).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        event_type: { [Op.in]: ["Created", "Rescheduled", "Cancelled"] },
                    },
                    include: [
                        expect.objectContaining({
                            association: "appointment",
                            where: { patient_id: 17 },
                            required: true,
                        }),
                    ],
                    limit: 20,
                }),
            );
            expect(result.history).toEqual([
                expect.objectContaining({
                    id: "appointment-28",
                    isInAppActivity: true,
                    channel: "En SaludVital",
                    statusLabel: "Registrada",
                    readAt: occurredAt,
                }),
            ]);
            expect(JSON.stringify(result.history)).not.toContain("private");
            expect(Notification.findAll).toHaveBeenCalledWith(
                expect.objectContaining({ where: { patient_id: 17 } }),
            );
        },
    );

    test("merges in-app activity with channel records newest first and limits the result", async () => {
        NotificationPreference.findAll.mockResolvedValue([]);
        Notification.findAll.mockResolvedValue([
            {
                id: 9,
                event_type: "appointment_reminder",
                channel: "SMS",
                status: "Sent",
                scheduled_at: new Date("2026-11-02T15:00:00.000Z"),
                sent_at: null,
                read_at: null,
            },
        ]);
        AppointmentHistory.findAll.mockResolvedValue([
            {
                id: 10,
                event_type: "Created",
                new_values: { start_at: "2026-11-08T16:00:00.000Z" },
                occurred_at: new Date("2026-11-03T15:00:00.000Z"),
                appointment: { id: 54, start_at: new Date("2026-11-08T16:00:00.000Z") },
            },
        ]);

        const result = await getPatientNotificationSettings(91);

        expect(result.history.map((item) => item.id)).toEqual(["appointment-10", 9]);
        expect(result.history[1].statusLabel).toBe("Aceptado por el proveedor");
    });

    test("marks only unread provider notifications visible beside appointment activity", async () => {
        NotificationPreference.findAll.mockResolvedValue([]);
        Notification.findAll.mockResolvedValue([
            {
                id: 71,
                event_type: "appointment_reminder",
                channel: "SMS",
                status: "Pending",
                scheduled_at: new Date("2026-11-02T15:00:00.000Z"),
                sent_at: null,
                read_at: null,
            },
        ]);
        AppointmentHistory.findAll.mockResolvedValue([
            {
                id: 72,
                event_type: "Rescheduled",
                new_values: { start_at: "2026-11-08T16:00:00.000Z" },
                occurred_at: new Date("2026-11-03T15:00:00.000Z"),
                appointment: { id: 54, start_at: new Date("2026-11-08T16:00:00.000Z") },
            },
        ]);

        const result = await getPatientNotificationSettings(91, { markVisibleAsRead: true });

        expect(result.history.map((item) => item.id)).toEqual(["appointment-72", 71]);
        expect(result.history[0].readAt).toEqual(new Date("2026-11-03T15:00:00.000Z"));
        expect(Notification.update.mock.calls[0][1].where.id[Op.in]).toEqual([71]);
    });
});
