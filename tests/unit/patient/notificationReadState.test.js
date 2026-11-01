import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Op } from "sequelize";

jest.unstable_mockModule("../../../config/database.js", () => ({ default: {} }));
jest.unstable_mockModule("../../../src/models/associations.js", () => ({
    Notification: { count: jest.fn(), findAll: jest.fn(), update: jest.fn() },
    NotificationPreference: { findAll: jest.fn() },
    Patient: { findOne: jest.fn() },
}));

const { Notification, NotificationPreference, Patient } =
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
});
