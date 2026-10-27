import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Op } from "sequelize";

jest.unstable_mockModule("../../src/models/AuditLog.js", () => ({
    default: { findAll: jest.fn(), findAndCountAll: jest.fn(), findByPk: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: { findAll: jest.fn(), findByPk: jest.fn() },
    Doctor: { findAll: jest.fn(), findByPk: jest.fn() },
    Rol: { findAll: jest.fn() },
    Specialities: { findAll: jest.fn(), findByPk: jest.fn() },
    User: { findByPk: jest.fn() },
}));

const AuditLog = (await import("../../src/models/AuditLog.js")).default;
const { Appointment, Doctor, Rol, Specialities, User } =
    await import("../../src/models/associations.js");
const { getAdminAuditEvent, getAdminAuditLogs } =
    await import("../../src/modules/admin/services/adminAuditService.js");

describe("administrator audit log directory", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        AuditLog.findAll.mockResolvedValue([]);
        AuditLog.findAll
            .mockResolvedValueOnce([{ action: "AdminAppointmentCancelled" }])
            .mockResolvedValueOnce([{ target_type: "Appointment" }]);
        AuditLog.findAndCountAll.mockResolvedValue({
            count: 1,
            rows: [
                {
                    id: 7,
                    actor_user_id: 12,
                    actor_snapshot: "Administrator private@example.co",
                    action: "AdminAppointmentCancelled",
                    target_type: "Appointment",
                    target_id: "456",
                    target_description: "patient@example.co",
                    reason: "Private reason",
                    changes: { clinicalHistory: "private data" },
                    occurred_at: new Date("2026-10-20T15:30:00.000Z"),
                },
            ],
        });
        AuditLog.findByPk.mockResolvedValue(null);
        Appointment.findAll.mockResolvedValue([]);
        Appointment.findByPk.mockResolvedValue(null);
        Doctor.findAll.mockResolvedValue([]);
        Doctor.findByPk.mockResolvedValue(null);
        Rol.findAll.mockResolvedValue([]);
        Specialities.findAll.mockResolvedValue([]);
        Specialities.findByPk.mockResolvedValue(null);
        User.findByPk.mockResolvedValue(null);
    });

    test("returns persisted records using safe labels and excludes sensitive event fields", async () => {
        Appointment.findAll.mockResolvedValue([
            {
                id: 456,
                patient: { first_name: "Laura", last_name: "Méndez" },
                doctor: { display_name: "Carlos Ramírez" },
                specialty: { name: "Cardiología" },
            },
        ]);
        const result = await getAdminAuditLogs();

        expect(result).toMatchObject({
            totalItems: 1,
            records: [
                {
                    id: 7,
                    actor: "Administrador: private@example.co",
                    module: "Citas médicas",
                    action: "Cancelación de cita",
                    description:
                        "Se canceló una cita · Cita: Laura Méndez · Carlos Ramírez · Cardiología.",
                },
            ],
            filters: {
                actions: [{ value: "AdminAppointmentCancelled", label: "Cancelación de cita" }],
                modules: [{ value: "Appointment", label: "Citas médicas" }],
            },
        });
        expect(JSON.stringify(result)).not.toMatch(
            /patient@example|clinicalHistory|Private reason/i,
        );
        expect(AuditLog.findAll.mock.calls[0][0].attributes).not.toContain("changes");
        expect(AuditLog.findAndCountAll.mock.calls[0][0].attributes).not.toContain("changes");
        expect(AuditLog.findAndCountAll.mock.calls[0][0].order).toEqual([
            ["occurred_at", "DESC"],
            ["id", "DESC"],
        ]);
        expect(AuditLog.findAndCountAll.mock.calls[0][0].limit).toBe(10);
        expect(AuditLog.findAndCountAll.mock.calls[0][0].offset).toBe(0);
        expect(AuditLog.findAndCountAll.mock.calls[0][0].include).toEqual(expect.any(Array));
        expect(Appointment.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                attributes: ["id", "patient_id", "doctor_id", "specialty_id"],
                include: expect.arrayContaining([
                    expect.objectContaining({ association: "patient" }),
                    expect.objectContaining({ association: "doctor" }),
                    expect.objectContaining({ association: "specialty" }),
                ]),
            }),
        );
        expect(result.pagination).toEqual({ page: 1, pageSize: 10, totalItems: 1, totalPages: 1 });
    });

    test("filters by local date range, action, and module", async () => {
        await getAdminAuditLogs({
            startDate: "2026-10-20",
            endDate: "2026-10-21",
            action: "AdminAppointmentCancelled",
            module: "Appointment",
        });

        expect(AuditLog.findAndCountAll.mock.calls[0][0].where).toEqual({
            action: "AdminAppointmentCancelled",
            target_type: "Appointment",
            occurred_at: {
                [Op.gte]: new Date("2026-10-20T05:00:00.000Z"),
                [Op.lt]: new Date("2026-10-22T05:00:00.000Z"),
            },
        });
    });

    test("rejects invalid dates and reversed ranges", async () => {
        await expect(getAdminAuditLogs({ startDate: "2026-02-30" })).rejects.toMatchObject({
            statusCode: 400,
        });
        await expect(
            getAdminAuditLogs({ startDate: "2026-10-21", endDate: "2026-10-20" }),
        ).rejects.toMatchObject({ statusCode: 400 });
    });

    test("rejects oversized filter values", async () => {
        await expect(getAdminAuditLogs({ action: "x".repeat(61) })).rejects.toMatchObject({
            statusCode: 400,
        });
    });

    test("requests the selected page from the database and returns pagination totals", async () => {
        AuditLog.findAndCountAll.mockResolvedValue({ count: 26, rows: [] });

        const result = await getAdminAuditLogs({ page: "3" });

        expect(AuditLog.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({ limit: 10, offset: 20 }),
        );
        expect(result.pagination).toEqual({ page: 3, pageSize: 10, totalItems: 26, totalPages: 3 });
    });

    test("moves an out-of-range page to the last available page", async () => {
        AuditLog.findAndCountAll
            .mockResolvedValueOnce({ count: 26, rows: [] })
            .mockResolvedValueOnce({ count: 26, rows: [] });

        const result = await getAdminAuditLogs({ page: "9" });

        expect(AuditLog.findAndCountAll.mock.calls.map(([options]) => options.offset)).toEqual([
            80, 20,
        ]);
        expect(result.pagination.page).toBe(3);
    });

    test("rejects unsupported filter values and invalid page numbers", async () => {
        await expect(getAdminAuditLogs({ action: "UnknownAction" })).rejects.toMatchObject({
            statusCode: 400,
        });
        await expect(getAdminAuditLogs({ module: "UnknownModule" })).rejects.toMatchObject({
            statusCode: 400,
        });
        await expect(getAdminAuditLogs({ page: "0" })).rejects.toMatchObject({ statusCode: 400 });
        await expect(getAdminAuditLogs({ page: "1.5" })).rejects.toMatchObject({
            statusCode: 400,
        });
    });

    test("returns persisted event details while allowing only safe recorded changes", async () => {
        AuditLog.findByPk.mockResolvedValue({
            id: 21,
            actor_user_id: 12,
            actor_snapshot: "Administrator private@example.co",
            action: "AdminUserAccountUpdated",
            target_type: "User",
            target_id: "456",
            target_description: "patient@example.co",
            reason: "Private explanation",
            result: "Success",
            occurred_at: new Date("2026-10-20T15:30:00.000Z"),
            changes: {
                previous: {
                    roleId: 2,
                    isActive: true,
                    dayOfWeek: 3,
                    validFrom: "2026-10-19",
                    password: "secret",
                },
                next: {
                    roleId: 3,
                    isActive: false,
                    dayOfWeek: 4,
                    validFrom: "2026-10-20",
                    email: "patient@example.co",
                },
                clinicalHistory: "private clinical data",
            },
            actor: {
                email: "admin@example.co",
                rol: { name: "Administrator" },
            },
        });
        Rol.findAll.mockResolvedValue([
            { id: 2, name: "Patient" },
            { id: 3, name: "Doctor" },
        ]);

        const result = await getAdminAuditEvent("21");

        expect(result).toMatchObject({
            id: 21,
            actor: "Administrador: admin@example.co",
            module: "Usuarios y roles",
            action: "Actualización de cuenta",
            targetType: "Usuarios y roles",
            targetId: "456",
            result: "Correcto",
            changes: {
                before: [
                    { label: "Rol", value: "Paciente" },
                    { label: "Estado activo", value: "Sí" },
                    { label: "Día de la semana", value: "Miércoles" },
                    { label: "Vigente desde", value: "2026-10-19" },
                ],
                after: [
                    { label: "Rol", value: "Médico" },
                    { label: "Estado activo", value: "No" },
                    { label: "Día de la semana", value: "Jueves" },
                    { label: "Vigente desde", value: "2026-10-20" },
                ],
                recorded: [],
            },
        });
        expect(JSON.stringify(result)).not.toMatch(
            /patient@example|Private explanation|secret|clinicalHistory|private clinical/i,
        );
        expect(AuditLog.findByPk).toHaveBeenCalledWith(
            21,
            expect.objectContaining({ attributes: expect.arrayContaining(["changes", "result"]) }),
        );
    });

    test("rejects malformed identifiers and reports missing events as not found", async () => {
        await expect(getAdminAuditEvent("0")).rejects.toMatchObject({ statusCode: 400 });
        await expect(getAdminAuditEvent("1abc")).rejects.toMatchObject({ statusCode: 400 });
        await expect(getAdminAuditEvent("999")).rejects.toMatchObject({
            statusCode: 404,
            message: "No encontramos el evento de auditoría solicitado.",
        });
    });

    test("describes schedule-triggered cancellations with patient, doctor, specialty and actor names", async () => {
        AuditLog.findByPk.mockResolvedValue({
            id: 22,
            actor_user_id: 12,
            actor_snapshot: "Administrator private@example.co",
            action: "AdminAppointmentCancelled",
            target_type: "Appointment",
            target_id: "456",
            result: "Success",
            occurred_at: new Date("2026-10-20T15:30:00.000Z"),
            changes: {
                previous: { status: "Confirmed" },
                next: { status: "Cancelled" },
                cancellationCause: "AdditionalAvailabilityDeactivated",
                password: "must not appear",
            },
            reason: "private reason",
        });
        Appointment.findByPk.mockResolvedValue({
            id: 456,
            patient: { first_name: "Laura", last_name: "Méndez" },
            doctor: { display_name: "Carlos Ramírez" },
            specialty: { name: "Cardiología" },
        });

        const result = await getAdminAuditEvent("22");

        expect(result.description).toBe(
            "Cita: Laura Méndez · Carlos Ramírez · Cardiología se canceló porque Administrador: private@example.co desactivó la disponibilidad adicional.",
        );
        expect(result.targetDescription).toBe("Cita: Laura Méndez · Carlos Ramírez · Cardiología");
        expect(result.changes.recorded).toContainEqual({
            label: "Motivo de cancelación",
            value: "Se desactivó la disponibilidad adicional",
        });
        expect(Appointment.findByPk).toHaveBeenCalledWith(
            456,
            expect.objectContaining({
                attributes: ["id", "patient_id", "doctor_id", "specialty_id"],
                include: expect.arrayContaining([
                    expect.objectContaining({ association: "patient" }),
                    expect.objectContaining({ association: "doctor" }),
                    expect.objectContaining({ association: "specialty" }),
                ]),
            }),
        );
        expect(JSON.stringify(result)).not.toMatch(/password|private reason/i);
    });

    test("shows doctor and specialty names instead of their numeric identifiers", async () => {
        AuditLog.findByPk.mockResolvedValue({
            id: 23,
            actor_user_id: null,
            action: "AdminAppointmentRescheduled",
            target_type: "DoctorAvailability",
            target_id: "55",
            result: "Success",
            occurred_at: new Date("2026-10-20T15:30:00.000Z"),
            changes: {
                previous: { doctorId: 8, specialtyId: 3 },
                next: { doctorId: 9, specialtyId: 4 },
            },
        });
        Doctor.findAll.mockResolvedValue([
            { id: 8, display_name: "Carlos Ramírez" },
            { id: 9, display_name: "Ana Torres" },
        ]);
        Specialities.findAll.mockResolvedValue([
            { id: 3, name: "Cardiología" },
            { id: 4, name: "Pediatría" },
        ]);

        const result = await getAdminAuditEvent("23");

        expect(result.changes.before).toEqual([
            { label: "Médico", value: "Carlos Ramírez" },
            { label: "Especialidad", value: "Cardiología" },
        ]);
        expect(result.changes.after).toEqual([
            { label: "Médico", value: "Ana Torres" },
            { label: "Especialidad", value: "Pediatría" },
        ]);
        expect(JSON.stringify(result.changes)).not.toMatch(/\b(?:8|9|3|4)\b/);
    });

    test("identifies an acting doctor by profile name without displaying the account ID", async () => {
        AuditLog.findByPk.mockResolvedValue({
            id: 24,
            actor_user_id: 82,
            actor_snapshot: "Doctor 82",
            action: "AdminDoctorScheduleUpdated",
            target_type: "DoctorAvailability",
            target_id: "91",
            result: "Success",
            occurred_at: new Date("2026-10-20T15:30:00.000Z"),
            changes: null,
            actor: {
                rol: { name: "Doctor" },
                doctor: { display_name: "Carlos Ramírez" },
            },
        });

        const result = await getAdminAuditEvent("24");

        expect(result.actor).toBe("Médico: Carlos Ramírez");
        expect(result.targetDescription).toBe("Horario médico");
        expect(JSON.stringify(result)).not.toContain("82");
    });
});
