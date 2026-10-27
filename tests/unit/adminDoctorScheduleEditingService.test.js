import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const transaction = { LOCK: { UPDATE: "UPDATE" } };

jest.unstable_mockModule("../../config/database.js", () => ({
    default: { transaction: jest.fn(async (callback) => callback(transaction)) },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: { findAll: jest.fn() },
    AppointmentStatus: { findOne: jest.fn() },
    Doctor: { findByPk: jest.fn() },
    DoctorAvailability: { findAll: jest.fn(), findByPk: jest.fn() },
    DoctorScheduleException: { findAll: jest.fn() },
    User: { findByPk: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/AuditLog.js", () => ({
    default: { create: jest.fn() },
}));

const database = (await import("../../config/database.js")).default;
const models = await import("../../src/models/associations.js");
const AuditLog = (await import("../../src/models/AuditLog.js")).default;
const { updateAdminDoctorSchedule } =
    await import("../../src/modules/admin/services/adminDoctorScheduleEditingService.js");
let currentSchedule;

function createCurrentSchedule() {
    const schedule = {
        id: 31,
        doctor_id: 7,
        is_active: true,
        day_of_week: 1,
        start_time: "08:00:00",
        end_time: "12:00:00",
        valid_from: "2026-01-01",
        valid_until: null,
    };
    schedule.update = jest.fn(async (values) => {
        Object.assign(schedule, values);
        return schedule;
    });
    return schedule;
}

function makeInput(overrides = {}) {
    return {
        validFrom: "2026-01-01",
        validUntil: null,
        blocks: [{ dayOfWeek: 1, startTime: "09:30", endTime: "12:00" }],
        ...overrides,
    };
}

function setDefaults() {
    currentSchedule = createCurrentSchedule();
    models.DoctorAvailability.findByPk.mockResolvedValue(currentSchedule);
    models.DoctorAvailability.findAll.mockResolvedValue([]);
    models.Doctor.findByPk.mockResolvedValue({ id: 7 });
    models.User.findByPk.mockResolvedValue({ id: 12, email: "admin@saludvital.co" });
    models.AppointmentStatus.findOne.mockResolvedValue({ id: 2 });
    models.Appointment.findAll.mockResolvedValue([]);
    models.DoctorScheduleException.findAll.mockResolvedValue([]);
    AuditLog.create.mockResolvedValue({ id: 99 });
}

describe("admin doctor schedule editing service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setDefaults();
    });

    test("updates the selected schedule and records an audit entry in the transaction", async () => {
        const result = await updateAdminDoctorSchedule(12, "31", makeInput());

        expect(models.DoctorAvailability.findByPk).toHaveBeenCalledWith(31, {
            transaction,
            lock: "UPDATE",
        });
        expect(currentSchedule.update).toHaveBeenCalledWith(
            {
                day_of_week: 1,
                start_time: "09:30",
                end_time: "12:00",
                valid_from: "2026-01-01",
                valid_until: null,
            },
            { transaction, validate: true },
        );
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                actor_user_id: 12,
                action: "AdminDoctorScheduleUpdated",
                target_id: "31",
                changes: {
                    before: expect.objectContaining({ startTime: "08:00" }),
                    after: expect.objectContaining({ startTime: "09:30" }),
                },
                result: "Success",
            }),
            { transaction },
        );
        expect(result).toMatchObject({ doctorId: 7, confirmedAppointmentsReviewed: 0 });
        expect(database.transaction).toHaveBeenCalledTimes(1);
    });

    test("requires confirmation before moving confirmed appointments outside the schedule", async () => {
        models.Appointment.findAll.mockResolvedValue([
            {
                id: 81,
                start_at: new Date("2030-10-28T14:00:00.000Z"),
                end_at: new Date("2030-10-28T14:30:00.000Z"),
            },
        ]);

        await expect(updateAdminDoctorSchedule(12, 31, makeInput())).rejects.toMatchObject({
            statusCode: 409,
            requiresConfirmation: true,
            impactedAppointments: [expect.objectContaining({ id: 81, status: "Confirmada" })],
        });
        expect(currentSchedule.update).not.toHaveBeenCalled();
        expect(AuditLog.create).not.toHaveBeenCalled();

        const result = await updateAdminDoctorSchedule(12, 31, makeInput({ confirmImpact: true }));
        expect(result.confirmedAppointmentsReviewed).toBe(1);
    });

    test("does not label appointments that were already outside the schedule as newly affected", async () => {
        models.Appointment.findAll.mockResolvedValue([
            {
                id: 93,
                start_at: new Date("2030-10-30T14:00:00.000Z"),
                end_at: new Date("2030-10-30T14:30:00.000Z"),
            },
        ]);

        const result = await updateAdminDoctorSchedule(12, 31, makeInput());

        expect(result.confirmedAppointmentsReviewed).toBe(0);
        expect(currentSchedule.update).toHaveBeenCalled();
    });

    test("rejects overlaps with another schedule and leaves the selected block unchanged", async () => {
        models.DoctorAvailability.findAll.mockResolvedValue([
            {
                id: 32,
                day_of_week: 1,
                start_time: "11:00:00",
                end_time: "13:00:00",
                valid_from: "2026-01-01",
                valid_until: null,
            },
        ]);

        await expect(
            updateAdminDoctorSchedule(
                12,
                31,
                makeInput({ blocks: [{ dayOfWeek: 1, startTime: "11:30", endTime: "12:30" }] }),
            ),
        ).rejects.toThrow("se superpone con otro intervalo");
        expect(currentSchedule.update).not.toHaveBeenCalled();
    });

    test("lists confirmed appointments overlapping stored Unavailable exceptions", async () => {
        models.Appointment.findAll.mockResolvedValue([
            {
                id: 92,
                start_at: new Date("2030-10-28T14:30:00.000Z"),
                end_at: new Date("2030-10-28T15:00:00.000Z"),
            },
        ]);
        models.DoctorScheduleException.findAll.mockResolvedValue([
            {
                start_at: new Date("2030-10-28T14:20:00.000Z"),
                end_at: new Date("2030-10-28T15:10:00.000Z"),
                reason: "Permiso personal",
            },
        ]);

        await expect(updateAdminDoctorSchedule(12, 31, makeInput())).rejects.toMatchObject({
            requiresConfirmation: true,
            impactedAppointments: [
                expect.objectContaining({
                    id: 92,
                    reason: "Excepción: Permiso personal",
                }),
            ],
        });
        expect(currentSchedule.update).not.toHaveBeenCalled();
    });

    test("returns not found for a missing or inactive schedule", async () => {
        models.DoctorAvailability.findByPk.mockResolvedValue(null);

        await expect(updateAdminDoctorSchedule(12, 31, makeInput())).rejects.toMatchObject({
            statusCode: 404,
        });
        expect(models.Doctor.findByPk).not.toHaveBeenCalled();
    });

    test("accepts one existing interval at a time", async () => {
        await expect(
            updateAdminDoctorSchedule(
                12,
                31,
                makeInput({
                    blocks: [
                        { dayOfWeek: 1, startTime: "09:30", endTime: "11:00" },
                        { dayOfWeek: 1, startTime: "11:00", endTime: "12:00" },
                    ],
                }),
            ),
        ).rejects.toThrow("Edita un solo intervalo");
        expect(currentSchedule.update).not.toHaveBeenCalled();
    });

    test("propagates audit failures so the transaction can roll back", async () => {
        AuditLog.create.mockRejectedValue(new Error("audit unavailable"));

        await expect(updateAdminDoctorSchedule(12, 31, makeInput())).rejects.toThrow(
            "audit unavailable",
        );
        expect(database.transaction).toHaveBeenCalledTimes(1);
        expect(currentSchedule.update).toHaveBeenCalled();
    });
});
