import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import database from "../../config/database.js";
import { getAdminAppointments } from "../../src/modules/admin/services/adminAppointmentService.js";

await import("../../src/models/associations.js");

describe("Admin appointment service MySQL integration", () => {
    beforeAll(async () => {
        await database.authenticate();
    });

    afterAll(async () => {
        await database.close();
    });

    test("queries real appointment relationships and bounded filters without exposing private fields", async () => {
        const result = await getAdminAppointments({
            from: "2026-01-01",
            to: "2026-12-31",
            status: "all",
            page: "1",
            pageSize: "10",
            search: "integration",
        });

        expect(result.appointments.length).toBeLessThanOrEqual(10);
        expect(result.pagination.page).toBe(1);
        expect(result.pagination.pageSize).toBe(10);
        expect(
            result.statuses.every((status) =>
                ["Confirmed", "In Progress", "Attended", "Cancelled"].includes(status.value),
            ),
        ).toBe(true);
        for (const appointment of result.appointments) {
            expect(appointment).not.toHaveProperty("reason");
            expect(appointment).not.toHaveProperty("source");
            expect(appointment.patient).not.toHaveProperty("phone");
        }
    });
});
