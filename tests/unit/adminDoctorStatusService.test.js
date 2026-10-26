import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.unstable_mockModule("sequelize", () => ({
    Op: { gt: Symbol("gt") },
}));
jest.unstable_mockModule("../../config/database.js", () => ({
    default: { transaction: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/AuditLog.js", () => ({
    default: { create: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: { findAll: jest.fn() },
    AppointmentHistory: { create: jest.fn() },
    AppointmentStatus: { findOne: jest.fn() },
    Doctor: { findByPk: jest.fn() },
    DoctorAvailability: {},
    EmailOutbox: {},
    Rol: { findByPk: jest.fn() },
    Specialities: {},
    User: { findByPk: jest.fn() },
}));
jest.unstable_mockModule(
    "../../src/modules/patient/services/notificationAutomationService.js",
    () => ({
        cancelPendingAppointmentReminders: jest.fn(),
        enqueueAppointmentNotifications: jest.fn(),
    }),
);
jest.unstable_mockModule("../../src/modules/admin/services/doctorPhotoService.js", () => ({
    removeDoctorPhoto: jest.fn(),
    storeDoctorPhoto: jest.fn(),
}));

const { Op } = await import("sequelize");
const database = (await import("../../config/database.js")).default;
const AuditLog = (await import("../../src/models/AuditLog.js")).default;
const { Appointment, AppointmentHistory, AppointmentStatus, Doctor, Rol, User } =
    await import("../../src/models/associations.js");
const notificationAutomation =
    await import("../../src/modules/patient/services/notificationAutomationService.js");
const { getAdminDoctorStatusImpact, updateAdminDoctorStatus } =
    await import("../../src/modules/admin/services/adminDoctorService.js");

function prepareStatusChange({ isActive = true, appointments = [] } = {}) {
    const transaction = { LOCK: { UPDATE: "UPDATE" } };
    const doctor = { id: 12, user_id: 7 };
    const doctorUser = {
        id: 7,
        role_id: 4,
        email: "doctor@example.com",
        is_active: isActive,
        update: jest.fn().mockImplementation(async (changes) => Object.assign(doctorUser, changes)),
    };
    database.transaction.mockImplementation((callback) => callback(transaction));
    Doctor.findByPk.mockResolvedValue(doctor);
    User.findByPk
        .mockResolvedValueOnce(doctorUser)
        .mockResolvedValueOnce({ id: 1, email: "admin@example.com" });
    Rol.findByPk.mockResolvedValue({ name: "Doctor" });
    AppointmentStatus.findOne.mockImplementation(async ({ where }) =>
        where.name === "Confirmed" ? { id: 1 } : { id: 4 },
    );
    Appointment.findAll.mockResolvedValue(appointments);
    AppointmentHistory.create.mockResolvedValue({});
    notificationAutomation.cancelPendingAppointmentReminders.mockResolvedValue(undefined);
    notificationAutomation.enqueueAppointmentNotifications.mockResolvedValue([]);
    AuditLog.create.mockResolvedValue({});
    return { transaction, doctor, doctorUser };
}

describe("Admin doctor status changes", () => {
    beforeEach(() => jest.resetAllMocks());

    test("reports the future confirmed appointments affected by deactivation", async () => {
        const upcoming = [{ id: 21 }, { id: 22 }];
        Doctor.findByPk.mockResolvedValue({
            id: 12,
            user: { role_id: 4, is_active: true },
        });
        Rol.findByPk.mockResolvedValue({ name: "Doctor" });
        AppointmentStatus.findOne.mockResolvedValue({ id: 1 });
        Appointment.findAll.mockResolvedValue(upcoming);

        await expect(getAdminDoctorStatusImpact("12")).resolves.toEqual({
            isActive: true,
            upcomingAppointmentCount: 2,
        });
        expect(Appointment.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    doctor_id: 12,
                    status_id: 1,
                    start_at: { [Op.gt]: expect.any(Date) },
                }),
            }),
        );
    });

    test("deactivates the account and cancels eligible appointments with history and notices", async () => {
        const firstAppointment = {
            id: 21,
            start_at: new Date("2027-04-01T14:00:00.000Z"),
            end_at: new Date("2027-04-01T14:30:00.000Z"),
            update: jest.fn().mockResolvedValue(undefined),
        };
        const secondAppointment = {
            id: 22,
            start_at: new Date("2027-04-02T14:00:00.000Z"),
            end_at: new Date("2027-04-02T14:30:00.000Z"),
            update: jest.fn().mockResolvedValue(undefined),
        };
        const { transaction, doctorUser } = prepareStatusChange({
            appointments: [firstAppointment, secondAppointment],
        });

        await expect(updateAdminDoctorStatus(1, 12, false)).resolves.toMatchObject({
            isActive: false,
            cancelledAppointmentCount: 2,
        });

        expect(doctorUser.update).toHaveBeenCalledWith({ is_active: false }, { transaction });
        expect(firstAppointment.update).toHaveBeenCalledWith({ status_id: 4 }, { transaction });
        expect(AppointmentHistory.create).toHaveBeenCalledTimes(2);
        expect(AppointmentHistory.create).toHaveBeenCalledWith(
            expect.objectContaining({
                appointment_id: 21,
                actor_user_id: 1,
                event_type: "Cancelled",
                new_values: { status: "Cancelled" },
            }),
            { transaction },
        );
        expect(notificationAutomation.cancelPendingAppointmentReminders).toHaveBeenCalledTimes(2);
        expect(notificationAutomation.enqueueAppointmentNotifications).toHaveBeenCalledWith({
            appointmentId: 21,
            eventType: "appointment_cancellation",
            transaction,
        });
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                actor_user_id: 1,
                action: "AdminDoctorDeactivated",
                target_type: "Doctor",
                changes: expect.objectContaining({
                    previous: { isActive: true },
                    next: { isActive: false },
                    cancelledAppointmentCount: 2,
                }),
                result: "Success",
            }),
            { transaction },
        );
    });

    test("reactivates access without restoring cancelled appointments", async () => {
        const { doctorUser, transaction } = prepareStatusChange({ isActive: false });

        await expect(updateAdminDoctorStatus(1, 12, true)).resolves.toMatchObject({
            isActive: true,
            cancelledAppointmentCount: 0,
        });

        expect(doctorUser.update).toHaveBeenCalledWith({ is_active: true }, { transaction });
        expect(Appointment.findAll).not.toHaveBeenCalled();
        expect(AppointmentHistory.create).not.toHaveBeenCalled();
        expect(notificationAutomation.enqueueAppointmentNotifications).not.toHaveBeenCalled();
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({ action: "AdminDoctorActivated" }),
            { transaction },
        );
    });

    test("rolls the transaction back when the existing cancellation queue cannot be written", async () => {
        const appointment = {
            id: 21,
            start_at: new Date("2027-04-01T14:00:00.000Z"),
            end_at: new Date("2027-04-01T14:30:00.000Z"),
            update: jest.fn().mockResolvedValue(undefined),
        };
        const { doctorUser } = prepareStatusChange({ appointments: [appointment] });
        notificationAutomation.enqueueAppointmentNotifications.mockRejectedValue(
            new Error("Notification queue unavailable."),
        );

        await expect(updateAdminDoctorStatus(1, 12, false)).rejects.toThrow(
            "Notification queue unavailable.",
        );
        expect(doctorUser.update).not.toHaveBeenCalled();
        expect(AuditLog.create).not.toHaveBeenCalled();
    });

    test("rejects malformed status values without opening a transaction", async () => {
        await expect(updateAdminDoctorStatus(1, 12, "false")).rejects.toMatchObject({
            statusCode: 400,
        });
        expect(database.transaction).not.toHaveBeenCalled();
    });
});
