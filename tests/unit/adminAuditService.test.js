import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Op } from "sequelize";

jest.unstable_mockModule("../../src/models/AuditLog.js", () => ({
    default: { findAll: jest.fn(), findAndCountAll: jest.fn() },
}));

const AuditLog = (await import("../../src/models/AuditLog.js")).default;
const { getAdminAuditLogs } = await import("../../src/modules/admin/services/adminAuditService.js");

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
    });

    test("returns persisted records using safe labels and excludes sensitive event fields", async () => {
        const result = await getAdminAuditLogs();

        expect(result).toMatchObject({
            totalItems: 1,
            records: [
                {
                    id: 7,
                    actor: "Administrador #12",
                    module: "Citas médicas",
                    action: "Cancelación de cita",
                    description: "Se canceló una cita #456.",
                },
            ],
            filters: {
                actions: [{ value: "AdminAppointmentCancelled", label: "Cancelación de cita" }],
                modules: [{ value: "Appointment", label: "Citas médicas" }],
            },
        });
        expect(JSON.stringify(result)).not.toMatch(
            /private@example|patient@example|clinicalHistory|Private reason/i,
        );
        expect(AuditLog.findAll.mock.calls[0][0].attributes).not.toContain("changes");
        expect(AuditLog.findAndCountAll.mock.calls[0][0].attributes).not.toContain("changes");
        expect(AuditLog.findAndCountAll.mock.calls[0][0].order).toEqual([
            ["occurred_at", "DESC"],
            ["id", "DESC"],
        ]);
        expect(AuditLog.findAndCountAll.mock.calls[0][0].limit).toBe(10);
        expect(AuditLog.findAndCountAll.mock.calls[0][0].offset).toBe(0);
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
});
