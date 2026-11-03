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
    Patient: { count: jest.fn() },
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

const { Appointment, Doctor, Notification, Patient, Rol, User } =
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
        Patient.count.mockResolvedValue(0);
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

    test("counts persisted patient profiles and linked active patient accounts", async () => {
        Patient.count.mockResolvedValueOnce(12).mockResolvedValueOnce(9);

        const dashboard = await getAdminDashboardData({}, "7");

        expect(dashboard.metrics.registeredPatients).toBe(12);
        expect(dashboard.metrics.activePatients).toBe(9);
        expect(Patient.count).toHaveBeenNthCalledWith(1);
        expect(Patient.count).toHaveBeenNthCalledWith(2, {
            include: [
                {
                    model: User,
                    as: "user",
                    attributes: [],
                    required: true,
                    where: { is_active: true },
                },
            ],
        });
        expect(User.count).not.toHaveBeenCalled();
        expect(dashboard.metrics).not.toHaveProperty("phone");
        expect(dashboard.metrics).not.toHaveProperty("email");
        expect(dashboard.metrics).not.toHaveProperty("documentNumber");
    });

    test("returns zero registered and active patients when there are no patient profiles", async () => {
        const dashboard = await getAdminDashboardData({}, "7");

        expect(dashboard.metrics.registeredPatients).toBe(0);
        expect(dashboard.metrics.activePatients).toBe(0);
    });

    test("includes persisted audit event identifiers for dashboard details", async () => {
        const occurredAt = new Date("2026-11-03T12:00:00.000Z");
        AuditLog.findAll.mockResolvedValue([
            {
                id: 42,
                action: "AdminAppointmentCancelled",
                target_type: "Appointment",
                result: "Success",
                occurred_at: occurredAt,
            },
        ]);

        const dashboard = await getAdminDashboardData({}, "7");

        expect(AuditLog.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                attributes: ["id", "action", "target_type", "result", "occurred_at"],
            }),
        );
        expect(dashboard.recentActivity).toEqual([
            {
                id: 42,
                actionLabel: "Cancelación de cita",
                moduleLabel: "Citas médicas",
                moduleIcon: "appointment",
                occurredAt,
            },
        ]);
    });
});
