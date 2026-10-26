import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const transaction = { LOCK: { UPDATE: "UPDATE" } };

jest.unstable_mockModule("../../config/database.js", () => ({
    default: { transaction: jest.fn(async (callback) => callback(transaction)) },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: { findByPk: jest.fn() },
    AppointmentStatus: { findOne: jest.fn() },
    AppointmentHistory: { create: jest.fn() },
    User: { findByPk: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/AuditLog.js", () => ({
    default: { create: jest.fn() },
}));
jest.unstable_mockModule(
    "../../src/modules/patient/services/notificationAutomationService.js",
    () => ({
        cancelPendingAppointmentReminders: jest.fn(),
        enqueueAppointmentNotifications: jest.fn(),
    }),
);

const { Appointment, AppointmentStatus, AppointmentHistory, User } =
    await import("../../src/models/associations.js");
const AuditLog = (await import("../../src/models/AuditLog.js")).default;
const notifications =
    await import("../../src/modules/patient/services/notificationAutomationService.js");
const { cancelAdminAppointment } =
    await import("../../src/modules/admin/services/adminAppointmentStatusService.js");

function createAppointment(status = "Confirmed", startAt = "2099-01-01T12:00:00.000Z") {
    return {
        id: 17,
        start_at: new Date(startAt),
        status: { name: status },
        update: jest.fn(),
    };
}

describe("admin appointment status service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Appointment.findByPk.mockResolvedValue(createAppointment());
        User.findByPk.mockResolvedValue({ id: 4, email: "admin@saludvital.co" });
        AppointmentStatus.findOne.mockResolvedValue({ id: 9, name: "Cancelled" });
    });

    test("cancels a future confirmed appointment and writes history, audit, and notifications", async () => {
        const appointment = createAppointment();
        Appointment.findByPk.mockResolvedValue(appointment);

        await expect(
            cancelAdminAppointment(4, "17", { reason: "Solicitado por el paciente" }),
        ).resolves.toEqual({
            appointmentId: 17,
            status: "Cancelled",
            statusLabel: "Cancelada",
        });

        expect(appointment.update).toHaveBeenCalledWith({ status_id: 9 }, { transaction });
        expect(AppointmentHistory.create).toHaveBeenCalledWith(
            expect.objectContaining({
                event_type: "Cancelled",
                previous_values: { status: "Confirmed" },
                new_values: { status: "Cancelled" },
                reason: "Solicitado por el paciente",
            }),
            { transaction },
        );
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({ action: "AdminAppointmentCancelled", result: "Success" }),
            { transaction },
        );
        expect(notifications.cancelPendingAppointmentReminders).toHaveBeenCalledWith(
            17,
            transaction,
        );
        expect(notifications.enqueueAppointmentNotifications).toHaveBeenCalledWith(
            expect.objectContaining({ eventType: "appointment_cancellation", transaction }),
        );
    });

    test("rejects transitions from statuses that are not confirmed", async () => {
        Appointment.findByPk.mockResolvedValue(createAppointment("In Progress"));

        await expect(cancelAdminAppointment(4, 17)).rejects.toMatchObject({ statusCode: 409 });
        expect(AppointmentStatus.findOne).not.toHaveBeenCalled();
        expect(AppointmentHistory.create).not.toHaveBeenCalled();
    });

    test("rejects appointments that already started", async () => {
        Appointment.findByPk.mockResolvedValue(
            createAppointment("Confirmed", "2000-01-01T12:00:00.000Z"),
        );

        await expect(cancelAdminAppointment(4, 17)).rejects.toMatchObject({ statusCode: 409 });
        expect(AppointmentStatus.findOne).not.toHaveBeenCalled();
    });

    test("validates the optional cancellation reason", async () => {
        await expect(
            cancelAdminAppointment(4, 17, { reason: "x".repeat(501) }),
        ).rejects.toMatchObject({
            statusCode: 400,
        });
        expect(Appointment.findByPk).not.toHaveBeenCalled();
    });
});
