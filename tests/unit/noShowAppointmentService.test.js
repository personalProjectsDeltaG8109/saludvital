import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Op } from "sequelize";

const transaction = { LOCK: { UPDATE: "UPDATE" } };

jest.unstable_mockModule("../../config/database.js", () => ({
    default: { transaction: jest.fn((callback) => callback(transaction)) },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Appointment: { findAll: jest.fn(), update: jest.fn() },
    AppointmentHistory: { create: jest.fn() },
    AppointmentStatus: { findAll: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/AuditLog.js", () => ({
    default: { create: jest.fn() },
}));

const { Appointment, AppointmentHistory, AppointmentStatus } =
    await import("../../src/models/associations.js");
const AuditLog = (await import("../../src/models/AuditLog.js")).default;
const { markMissedAppointments } =
    await import("../../src/modules/admin/services/noShowAppointmentService.js");

const NOW = new Date("2026-11-04T18:00:00.000Z");
const CUTOFF = new Date("2026-11-04T17:00:00.000Z");

function appointment(id, statusId, startAt) {
    return { id, status_id: statusId, start_at: new Date(startAt) };
}

describe("no-show appointment service", () => {
    let rows;

    beforeEach(() => {
        jest.clearAllMocks();
        rows = [appointment(1, 1, CUTOFF)];
        AppointmentStatus.findAll.mockResolvedValue([
            { id: 1, name: "Confirmed" },
            { id: 5, name: "No Show" },
        ]);
        Appointment.findAll.mockImplementation(async ({ where }) =>
            rows.filter(
                (row) =>
                    row.status_id === where.status_id && row.start_at <= where.start_at[Op.lte],
            ),
        );
        Appointment.update.mockImplementation(async (values, { where }) => {
            const row = rows.find(
                (candidate) => candidate.id === where.id && candidate.status_id === where.status_id,
            );
            if (!row) return [0];
            row.status_id = values.status_id;
            return [1];
        });
        AppointmentHistory.create.mockResolvedValue(undefined);
        AuditLog.create.mockResolvedValue(undefined);
    });

    test("marks an appointment at the exact one-hour grace boundary", async () => {
        await expect(markMissedAppointments({ referenceTime: NOW })).resolves.toBe(1);

        expect(Appointment.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { status_id: 1, start_at: { [Op.lte]: CUTOFF } },
                transaction,
                lock: transaction.LOCK.UPDATE,
            }),
        );
        expect(AppointmentHistory.create).toHaveBeenCalledWith(
            expect.objectContaining({
                event_type: "NoShowMarked",
                previous_values: { status: "Confirmed" },
                new_values: { status: "No Show" },
            }),
            { transaction },
        );
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({ action: "AppointmentMarkedNoShow", result: "Success" }),
            { transaction },
        );
    });

    test("compares equivalent Bogota and UTC timestamps as the same instant", async () => {
        const bogotaReferenceTime = new Date("2026-11-04T13:00:00-05:00");
        const bogotaAppointmentStart = new Date("2026-11-04T12:00:00-05:00");
        rows = [appointment(1, 1, bogotaAppointmentStart)];

        await expect(markMissedAppointments({ referenceTime: bogotaReferenceTime })).resolves.toBe(
            1,
        );
        expect(Appointment.findAll.mock.calls[0][0].where.start_at[Op.lte]).toEqual(CUTOFF);
    });

    test("does not mark appointments before the grace period ends", async () => {
        rows = [appointment(1, 1, "2026-11-04T17:00:00.001Z")];

        await expect(markMissedAppointments({ referenceTime: NOW })).resolves.toBe(0);
        expect(Appointment.update).not.toHaveBeenCalled();
    });

    test("does nothing while the appointment status catalog has not been seeded", async () => {
        AppointmentStatus.findAll.mockResolvedValue([{ id: 5, name: "No Show" }]);

        await expect(markMissedAppointments({ referenceTime: NOW })).resolves.toBe(0);
        expect(Appointment.findAll).not.toHaveBeenCalled();
    });

    test("recovers appointments that became eligible while the server was stopped", async () => {
        rows = [appointment(1, 1, "2026-11-01T12:00:00.000Z")];

        await expect(markMissedAppointments({ referenceTime: NOW })).resolves.toBe(1);
        expect(Appointment.findAll.mock.calls[0][0].where.start_at[Op.lte]).toEqual(CUTOFF);
    });

    test.each([
        ["cancelled", 4],
        ["attended", 3],
        ["in progress", 2],
        ["already missed", 5],
    ])("excludes %s appointments", async (_label, statusId) => {
        rows = [appointment(1, statusId, "2026-11-04T16:00:00.000Z")];

        await expect(markMissedAppointments({ referenceTime: NOW })).resolves.toBe(0);
        expect(Appointment.update).not.toHaveBeenCalled();
        expect(AppointmentHistory.create).not.toHaveBeenCalled();
    });

    test("does not write duplicate history if a competing worker already changed the status", async () => {
        Appointment.update.mockResolvedValue([0]);

        await expect(markMissedAppointments({ referenceTime: NOW })).resolves.toBe(0);
        expect(AppointmentHistory.create).not.toHaveBeenCalled();
        expect(AuditLog.create).not.toHaveBeenCalled();
    });

    test("a repeated run does not transition the same appointment twice", async () => {
        await markMissedAppointments({ referenceTime: NOW });
        await expect(markMissedAppointments({ referenceTime: NOW })).resolves.toBe(0);

        expect(AppointmentHistory.create).toHaveBeenCalledTimes(1);
        expect(AuditLog.create).toHaveBeenCalledTimes(1);
    });

    test("validates batch size and reference time", async () => {
        await expect(markMissedAppointments({ batchSize: 0 })).rejects.toThrow(TypeError);
        await expect(markMissedAppointments({ referenceTime: "invalid" })).rejects.toThrow(
            TypeError,
        );
    });
});
