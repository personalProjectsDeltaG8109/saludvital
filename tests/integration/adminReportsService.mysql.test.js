import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import database from "../../config/database.js";
import { getAdminReportsData } from "../../src/modules/admin/services/adminReportsService.js";

await import("../../src/models/associations.js");

describe("administrator reports service MySQL integration", () => {
    beforeAll(async () => {
        await database.authenticate();
    });

    afterAll(async () => {
        await database.close();
    });

    test("uses persisted appointment statuses and history with the selected date range", async () => {
        const report = await getAdminReportsData(new Date("2026-10-27T12:00:00.000Z"), 7);
        const statusCounts = report.statusChart.segments.map((segment) => segment.count);

        expect(report.period.days).toBe(7);
        expect(report.trend.dates).toHaveLength(7);
        expect(report.statusChart.segments.map((segment) => segment.status)).toEqual([
            "Confirmed",
            "Cancelled",
            "Rescheduled",
        ]);
        expect(report.statusChart.total).toBe(
            statusCounts.reduce((total, count) => total + count, 0),
        );
        expect(report.statusChart.total).toBeLessThanOrEqual(report.summary.totalAppointments);
        expect(report.trend.series.map((series) => series.status)).toEqual([
            "Attended",
            "Confirmed",
            "Cancelled",
        ]);
    });
});
