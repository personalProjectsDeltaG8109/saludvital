import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const transaction = { LOCK: { UPDATE: "UPDATE" } };

jest.unstable_mockModule("../../config/database.js", () => ({
    default: { transaction: jest.fn(async (callback) => callback(transaction)) },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: { findAll: jest.fn() },
    AppointmentStatus: { findOne: jest.fn() },
    Doctor: { findAll: jest.fn(), findByPk: jest.fn() },
    DoctorAvailability: {},
    DoctorScheduleException: {
        create: jest.fn(),
        findAll: jest.fn(),
        findByPk: jest.fn(),
    },
    User: { findByPk: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/AuditLog.js", () => ({
    default: { create: jest.fn() },
}));

const database = (await import("../../config/database.js")).default;
const models = await import("../../src/models/associations.js");
const AuditLog = (await import("../../src/models/AuditLog.js")).default;
const {
    createAdminDoctorScheduleException,
    getAdminDoctorScheduleExceptions,
    updateAdminDoctorScheduleException,
    updateAdminDoctorScheduleExceptionStatus,
} = await import("../../src/modules/admin/services/adminDoctorScheduleExceptionService.js");

const input = {
    doctorId: "7",
    type: "Unavailable",
    reason: "Permiso personal",
    startAt: "2030-10-28T08:00",
    endAt: "2030-10-28T12:00",
};

function createRecord(overrides = {}) {
    const record = {
        id: 21,
        doctor_id: 7,
        start_at: new Date("2030-10-28T13:00:00.000Z"),
        end_at: new Date("2030-10-28T17:00:00.000Z"),
        exception_type: "Unavailable",
        reason: "Permiso personal",
        is_active: true,
        ...overrides,
    };
    record.update = jest.fn(async (values) => {
        Object.assign(record, values);
        return record;
    });
    return record;
}

function setDefaults() {
    models.Doctor.findByPk.mockResolvedValue({ id: 7 });
    models.User.findByPk.mockResolvedValue({ id: 12, email: "admin@saludvital.co" });
    models.AppointmentStatus.findOne.mockResolvedValue({ id: 2 });
    models.Appointment.findAll.mockResolvedValue([]);
    models.DoctorScheduleException.findAll.mockResolvedValue([]);
    models.DoctorScheduleException.findByPk.mockResolvedValue(createRecord());
    models.DoctorScheduleException.create.mockImplementation(async (values) => ({
        id: 31,
        ...values,
    }));
    models.Doctor.findAll.mockResolvedValue([{ id: 7, display_name: "Dra. Ana Torres" }]);
    AuditLog.create.mockResolvedValue({ id: 80 });
}

describe("admin doctor schedule exception service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setDefaults();
    });

    test("lists real exceptions and active doctors with the requested status filter", async () => {
        const exception = createRecord({ doctor: { display_name: "Dra. Ana Torres" } });
        models.DoctorScheduleException.findAll.mockResolvedValue([exception]);

        const result = await getAdminDoctorScheduleExceptions({ status: "inactive" });

        expect(models.DoctorScheduleException.findAll).toHaveBeenCalledWith(
            expect.objectContaining({ where: { is_active: false } }),
        );
        expect(result.exceptions[0]).toMatchObject({
            id: 21,
            doctorName: "Dra. Ana Torres",
            type: "Unavailable",
            isActive: true,
        });
        expect(result.doctors).toEqual([{ id: 7, name: "Dra. Ana Torres" }]);
    });

    test("requires reviewing affected appointments before creating an exception", async () => {
        models.Appointment.findAll.mockResolvedValue([
            {
                id: 91,
                doctor_id: 7,
                start_at: new Date("2030-10-28T14:00:00.000Z"),
                end_at: new Date("2030-10-28T14:30:00.000Z"),
            },
        ]);

        await expect(createAdminDoctorScheduleException(12, input)).rejects.toMatchObject({
            statusCode: 409,
            requiresConfirmation: true,
            affectedAppointments: [expect.objectContaining({ id: 91 })],
        });
        expect(models.DoctorScheduleException.create).not.toHaveBeenCalled();

        const result = await createAdminDoctorScheduleException(12, {
            ...input,
            confirmImpact: true,
        });

        expect(models.DoctorScheduleException.create).toHaveBeenCalledWith(
            expect.objectContaining({
                doctor_id: 7,
                exception_type: "Unavailable",
                reason: "Permiso personal",
                is_active: true,
            }),
            { transaction, validate: true },
        );
        expect(result.affectedAppointmentsReviewed).toBe(1);
        expect(result.message).toContain("creó correctamente");
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({ action: "AdminDoctorScheduleExceptionCreated" }),
            { transaction },
        );
        expect(models.Appointment.update).toBeUndefined();
    });

    test("updates exception values after confirmation without modifying appointments", async () => {
        const record = createRecord();
        models.DoctorScheduleException.findByPk.mockResolvedValue(record);
        models.Appointment.findAll.mockResolvedValue([
            {
                id: 92,
                doctor_id: 7,
                start_at: new Date("2030-10-28T14:00:00.000Z"),
                end_at: new Date("2030-10-28T14:30:00.000Z"),
            },
        ]);

        const result = await updateAdminDoctorScheduleException(12, 21, {
            ...input,
            reason: "Vacaciones",
            confirmImpact: true,
        });

        expect(record.update).toHaveBeenCalledWith(
            expect.objectContaining({ reason: "Vacaciones", exception_type: "Unavailable" }),
            { transaction, validate: true },
        );
        expect(result.affectedAppointmentsReviewed).toBe(1);
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({ action: "AdminDoctorScheduleExceptionUpdated" }),
            { transaction },
        );
        expect(models.Appointment.update).toBeUndefined();
    });

    test("deactivates and reactivates without deleting the exception", async () => {
        const record = createRecord();
        models.DoctorScheduleException.findByPk.mockResolvedValue(record);

        const result = await updateAdminDoctorScheduleExceptionStatus(12, 21, {
            isActive: false,
        });

        expect(record.update).toHaveBeenCalledWith(
            { is_active: false },
            { transaction, validate: true },
        );
        expect(result.exception.isActive).toBe(false);
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({ action: "AdminDoctorScheduleExceptionDeactivated" }),
            { transaction },
        );
        expect(database.transaction).toHaveBeenCalled();
    });

    test.each([
        [{ ...input, type: "Vacation" }, "tipo de excepción"],
        [{ ...input, startAt: "2030-10-28T08:15" }, "incrementos de 30 minutos"],
        [{ ...input, endAt: "2030-10-28T08:00" }, "posterior al inicio"],
        [{ ...input, reason: " " }, "descripción es obligatoria"],
    ])("rejects unsupported or invalid exception values", async (invalidInput, message) => {
        await expect(createAdminDoctorScheduleException(12, invalidInput)).rejects.toThrow(message);
        expect(database.transaction).not.toHaveBeenCalled();
    });
});
