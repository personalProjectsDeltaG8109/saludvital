import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const greaterThanOrEqual = Symbol("gte");
const lessThan = Symbol("lt");

jest.unstable_mockModule("sequelize", () => ({
    col: jest.fn((value) => value),
    fn: jest.fn((...values) => values),
    Op: { gte: greaterThanOrEqual, lt: lessThan },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: { findAll: jest.fn() },
    AppointmentStatus: {},
    Doctor: { count: jest.fn() },
    Notification: { count: jest.fn(), findAll: jest.fn() },
    Rol: { findOne: jest.fn() },
    Specialities: {},
    User: { count: jest.fn(), findByPk: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/AuditLog.js", () => ({
    default: { findAll: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/WhatsAppAppointmentRequest.js", () => ({
    default: { count: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/WhatsAppConversation.js", () => ({
    default: { count: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/WhatsAppMessage.js", () => ({
    default: { count: jest.fn() },
}));

const { Appointment, Doctor, Notification, Rol, User } =
    await import("../../src/models/associations.js");
const AuditLog = (await import("../../src/models/AuditLog.js")).default;
const WhatsAppAppointmentRequest = (await import("../../src/models/WhatsAppAppointmentRequest.js"))
    .default;
const WhatsAppConversation = (await import("../../src/models/WhatsAppConversation.js")).default;
const WhatsAppMessage = (await import("../../src/models/WhatsAppMessage.js")).default;
const { getAdminDashboardData } =
    await import("../../src/modules/admin/services/adminDashboardService.js");

describe("administrator dashboard notification preferences", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Rol.findOne.mockResolvedValue({ id: 2 });
        User.count.mockResolvedValue(0);
        User.findByPk.mockResolvedValue({ admin_notifications_enabled: true });
        Doctor.count.mockResolvedValue(0);
        Appointment.findAll.mockResolvedValue([]);
        WhatsAppAppointmentRequest.count.mockResolvedValue(0);
        WhatsAppConversation.count.mockResolvedValue(0);
        WhatsAppMessage.count.mockResolvedValue(0);
        Notification.count.mockResolvedValue(1);
        Notification.findAll.mockResolvedValue([
            {
                event_type: "AppointmentCancelled",
                status: "Failed",
                scheduled_at: new Date("2026-10-27T12:00:00.000Z"),
                sent_at: null,
            },
        ]);
        AuditLog.findAll.mockResolvedValue([]);
    });

    test("hides the existing delivery feed and failure badge when disabled", async () => {
        User.findByPk.mockResolvedValue({ admin_notifications_enabled: false });

        const dashboard = await getAdminDashboardData({}, "7");

        expect(dashboard.systemNotifications).toEqual([]);
        expect(dashboard.notificationAlertCount).toBe(0);
        expect(Notification.findAll).toHaveBeenCalled();
        expect(Notification.count).toHaveBeenCalled();
    });

    test("shows persisted delivery information when enabled", async () => {
        const dashboard = await getAdminDashboardData({}, "7");

        expect(dashboard.systemNotifications).toEqual([
            {
                eventType: "AppointmentCancelled",
                status: "Failed",
                occurredAt: new Date("2026-10-27T12:00:00.000Z"),
            },
        ]);
        expect(dashboard.notificationAlertCount).toBe(1);
    });
});
