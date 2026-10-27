import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const transaction = { LOCK: { UPDATE: "UPDATE" } };

jest.unstable_mockModule("../../config/database.js", () => ({
    default: { transaction: jest.fn(async (callback) => callback(transaction)) },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: { findAll: jest.fn() },
    AppointmentStatus: { findOne: jest.fn() },
    Doctor: { findByPk: jest.fn() },
    DoctorAvailability: { findAll: jest.fn(), bulkCreate: jest.fn() },
    DoctorScheduleException: { findAll: jest.fn() },
    User: {},
}));

const database = (await import("../../config/database.js")).default;
const models = await import("../../src/models/associations.js");
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
    models.AppointmentStatus.findOne.mockResolvedValue({ id: 2 });
    models.Appointment.findAll.mockResolvedValue([]);
    models.DoctorScheduleException.findAll.mockResolvedValue([]);
    models.DoctorAvailability.bulkCreate.mockImplementation(async (records) =>
        records.map((record, index) => ({ id: index + 1, ...record })),
    );
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

    test("requires explicit confirmation and keeps affected confirmed appointments unchanged", async () => {
        models.Appointment.findAll.mockResolvedValue([
            {
                id: 45,
                start_at: new Date("2026-10-28T14:00:00.000Z"),
                end_at: new Date("2026-10-28T14:30:00.000Z"),
            },
        ]);

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

        const result = await configureAdminDoctorSchedule(makeInput({ confirmImpact: true }));
        expect(result.confirmedAppointmentsReviewed).toBe(1);
        expect(models.DoctorAvailability.bulkCreate).toHaveBeenCalledTimes(1);
        expect(models.Appointment.update).toBeUndefined();
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
