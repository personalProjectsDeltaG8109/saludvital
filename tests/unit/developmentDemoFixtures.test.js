import { afterEach, describe, expect, test } from "@jest/globals";
import { up } from "../../database/seeders/20261108120000-development-demo-environment.js";
import {
    DEMO_ACCOUNTS,
    addDemoMinutes,
    formatDemoDateTime,
    getDemoAppointmentScenarios,
    getDemoClinicalRecords,
} from "../../database/developmentDemoFixtures.js";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
});

describe("development demo fixtures", () => {
    test("provides unique, complete demo sign-in accounts for the three roles", () => {
        const emails = DEMO_ACCOUNTS.map((account) => account.email);
        expect(new Set(emails).size).toBe(emails.length);
        expect(new Set(DEMO_ACCOUNTS.map((account) => account.role))).toEqual(
            new Set(["Patient", "Doctor", "Administrator"]),
        );
    });

    test("builds current Colombian appointment dates and covers the demo states", () => {
        const referenceDate = new Date("2026-11-08T17:30:00.000Z");
        const scenarios = getDemoAppointmentScenarios(referenceDate);
        const byKey = Object.fromEntries(scenarios.map((scenario) => [scenario.key, scenario]));
        expect(formatDemoDateTime(3, 9, 0, referenceDate)).toBe("2026-11-11 09:00:00");
        expect(new Set(scenarios.map((scenario) => scenario.status))).toEqual(
            new Set(["Confirmed", "Attended", "Cancelled", "No Show"]),
        );
        expect(byKey.rescheduled.status).toBe("Confirmed");
        expect(byKey.rescheduled.previousEndAt < byKey.rescheduled.startAt).toBe(true);
        expect(byKey.cancelled.startAt > "2026-11-08 12:00:00").toBe(true);
        expect(byKey["no-show"].startAt < "2026-11-08 12:00:00").toBe(true);
    });

    test("adds durations across date boundaries and labels all clinical examples as fictitious", () => {
        expect(addDemoMinutes("2026-11-30 23:45:00", 30)).toBe("2026-12-01 00:15:00");
        const records = getDemoClinicalRecords();
        expect(records).toHaveLength(3);
        for (const record of records) {
            expect(record.symptoms).toContain("DEMO:");
            expect(record.notes).toContain("DEMO:");
            expect(record.diagnosis).toContain("DEMO:");
        }
    });

    test("refuses to seed demo data in production before opening a database connection", async () => {
        process.env.NODE_ENV = "production";
        await expect(up({})).rejects.toThrow(
            "Development demo data cannot be seeded in production.",
        );
    });
});
