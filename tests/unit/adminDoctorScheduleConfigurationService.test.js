import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const transaction = { LOCK: { UPDATE: "UPDATE" } };

jest.unstable_mockModule("../../config/database.js", () => ({
    default: { transaction: jest.fn(async (callback) => callback(transaction)) },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: { findAll: jest.fn() },
    AppointmentHistory: { create: jest.fn() },
    AppointmentStatus: { findOne: jest.fn() },
    Doctor: { findByPk: jest.fn() },
    DoctorAvailability: { findAll: jest.fn(), bulkCreate: jest.fn() },
    DoctorScheduleException: { findAll: jest.fn() },
    User: { findByPk: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/AuditLog.js", () => ({
    default: { create: jest.fn() },
}));
jest.unstable_mockModule(
    "../../src/modules/patient/services/notificationAutomationService.js",
    () => ({
        cancelPendingAppointmentReminders: jest.fn(),
        enqueueAppointmentNotifications: jest.fn(async () => [{ id: 1 }]),
    }),
);

const database = (await import("../../config/database.js")).default;
const models = await import("../../src/models/associations.js");
const AuditLog = (await import("../../src/models/AuditLog.js")).default;
const notifications =
    await import("../../src/modules/patient/services/notificationAutomationService.js");
const { configureAdminDoctorSchedule } =
    await import("../../src/modules/admin/services/adminDoctorScheduleConfigurationService.js");

function makeInput(overrides = {}) {
    return {
        doctorId: 7,
        validFrom: "2026-10-26",
        validUntil: null,
        blocks: [{ dayOfWeek: 1, startTime: "08:00", endTime: "12:00" }],
        ...overrides,
    };
}

function setDefaults() {
    models.Doctor.findByPk.mockResolvedValue({ id: 7 });
    models.DoctorAvailability.findAll.mockResolvedValue([]);
    models.AppointmentStatus.findOne.mockImplementation(({ where }) =>
        Promise.resolve(where.name === "Confirmed" ? { id: 2 } : { id: 3 }),
    );
    models.Appointment.findAll.mockResolvedValue([]);
    models.DoctorScheduleException.findAll.mockResolvedValue([]);
    models.DoctorAvailability.bulkCreate.mockImplementation(async (records) =>
        records.map((record, index) => ({ id: index + 1, ...record })),
    );
    models.User.findByPk.mockResolvedValue({ id: 12, email: "admin@saludvital.co" });
    models.AppointmentHistory.create.mockResolvedValue({ id: 1 });
    AuditLog.create.mockResolvedValue({ id: 1 });
    notifications.cancelPendingAppointmentReminders.mockResolvedValue(undefined);
    notifications.enqueueAppointmentNotifications.mockResolvedValue([{ id: 1 }]);
}

describe("admin doctor schedule configuration service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setDefaults();
    });

    test("creates availability blocks in a transaction without changing appointments", async () => {
        const result = await configureAdminDoctorSchedule(makeInput());

        expect(database.transaction).toHaveBeenCalledTimes(1);
        expect(models.DoctorAvailability.bulkCreate).toHaveBeenCalledWith(
            [
                expect.objectContaining({
                    doctor_id: 7,
                    day_of_week: 1,
                    start_time: "08:00",
                    end_time: "12:00",
                    valid_from: "2026-10-26",
                    is_active: true,
                }),
            ],
            expect.objectContaining({ transaction, validate: true }),
        );
        expect(result.availability[0]).toMatchObject({
            dayOfWeek: 1,
            dayLabel: "Lunes",
            startTime: "08:00",
            endTime: "12:00",
        });
        expect(models.Appointment.update).toBeUndefined();
    });

    test("allows a one-hour break between two working intervals on the same day", async () => {
        const result = await configureAdminDoctorSchedule(
            makeInput({
                blocks: [
                    { dayOfWeek: 1, startTime: "07:00", endTime: "12:00" },
                    { dayOfWeek: 1, startTime: "13:00", endTime: "17:00" },
                ],
            }),
        );

        expect(models.DoctorAvailability.bulkCreate).toHaveBeenCalledWith(
            [
                expect.objectContaining({ start_time: "07:00", end_time: "12:00" }),
                expect.objectContaining({ start_time: "13:00", end_time: "17:00" }),
            ],
            expect.objectContaining({ transaction, validate: true }),
        );
        expect(result.availability).toHaveLength(2);
    });

    test("rejects invalid ranges and overlapping blocks in the submitted form", async () => {
        await expect(
            configureAdminDoctorSchedule(
                makeInput({ blocks: [{ dayOfWeek: 1, startTime: "08:00", endTime: "08:45" }] }),
            ),
        ).rejects.toMatchObject({ statusCode: 400 });
        await expect(
            configureAdminDoctorSchedule(
                makeInput({ blocks: [{ dayOfWeek: 1, startTime: "08:15", endTime: "09:15" }] }),
            ),
        ).rejects.toThrow("intervalos de 30 minutos");
        await expect(
            configureAdminDoctorSchedule(
                makeInput({
                    blocks: [
                        { dayOfWeek: 1, startTime: "08:00", endTime: "10:00" },
                        { dayOfWeek: 1, startTime: "09:30", endTime: "11:00" },
                    ],
                }),
            ),
        ).rejects.toThrow("Hay intervalos superpuestos");
    });

    test("rejects overlaps with an existing active block whose validity dates intersect", async () => {
        models.DoctorAvailability.findAll.mockResolvedValue([
            {
                day_of_week: 1,
                start_time: "08:00:00",
                end_time: "10:00:00",
                valid_from: "2026-01-01",
                valid_until: "2026-12-31",
            },
        ]);

        await expect(configureAdminDoctorSchedule(makeInput())).rejects.toThrow(
            "se superpone con otro intervalo",
        );
        expect(models.DoctorAvailability.bulkCreate).not.toHaveBeenCalled();
    });

    test("requires confirmation, then cancels and notifies affected confirmed appointments", async () => {
        const affectedAppointment = {
            id: 45,
            start_at: new Date("2026-10-28T14:00:00.000Z"),
            end_at: new Date("2026-10-28T14:30:00.000Z"),
            update: jest.fn(),
        };
        models.Appointment.findAll.mockResolvedValue([affectedAppointment]);

        await expect(configureAdminDoctorSchedule(makeInput())).rejects.toMatchObject({
            statusCode: 409,
            requiresConfirmation: true,
            impactedAppointments: [
                expect.objectContaining({
                    id: 45,
                    status: "Confirmada",
                    reason: "Fuera del horario propuesto",
                }),
            ],
        });
        expect(models.DoctorAvailability.bulkCreate).not.toHaveBeenCalled();
        expect(affectedAppointment.update).not.toHaveBeenCalled();

        const result = await configureAdminDoctorSchedule(makeInput({ confirmImpact: true }), 12);
        expect(result.confirmedAppointmentsReviewed).toBe(1);
        expect(result.cancelledAppointments).toBe(1);
        expect(result.queuedNotifications).toBe(1);
        expect(models.DoctorAvailability.bulkCreate).toHaveBeenCalledTimes(1);
        expect(affectedAppointment.update).toHaveBeenCalledWith({ status_id: 3 }, { transaction });
        expect(models.AppointmentHistory.create).toHaveBeenCalledWith(
            expect.objectContaining({
                appointment_id: 45,
                event_type: "Cancelled",
                new_values: { status: "Cancelled" },
            }),
            { transaction },
        );
        expect(notifications.cancelPendingAppointmentReminders).toHaveBeenCalledWith(
            45,
            transaction,
        );
        expect(notifications.enqueueAppointmentNotifications).toHaveBeenCalledWith({
            appointmentId: 45,
            eventType: "appointment_cancellation",
            transaction,
        });
    });

    test("includes appointments overlapping stored Unavailable exceptions in confirmation", async () => {
        models.Appointment.findAll.mockResolvedValue([
            {
                id: 46,
                start_at: new Date("2026-10-26T14:00:00.000Z"),
                end_at: new Date("2026-10-26T14:30:00.000Z"),
            },
        ]);
        models.DoctorScheduleException.findAll.mockResolvedValue([
            {
                is_active: true,
                start_at: new Date("2026-10-26T13:45:00.000Z"),
                end_at: new Date("2026-10-26T14:45:00.000Z"),
                reason: "Permiso personal",
            },
        ]);

        await expect(configureAdminDoctorSchedule(makeInput())).rejects.toMatchObject({
            requiresConfirmation: true,
            impactedAppointments: [
                expect.objectContaining({ reason: "Excepción: Permiso personal" }),
            ],
        });
    });

    test("requires an active doctor", async () => {
        models.Doctor.findByPk.mockResolvedValue(null);

        await expect(configureAdminDoctorSchedule(makeInput())).rejects.toMatchObject({
            statusCode: 404,
        });
    });
});
