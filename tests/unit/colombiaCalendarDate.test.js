import { describe, expect, test } from "@jest/globals";
import { getColombiaCalendarDate } from "../../src/shared/utils/colombiaCalendarDate.js";

describe("Colombia calendar date", () => {
    test("keeps the local date before UTC midnight advances the server date", () => {
        expect(getColombiaCalendarDate(new Date("2026-11-21T01:00:00.000Z"))).toBe("2026-11-20");
    });

    test("changes date at midnight in Colombia", () => {
        expect(getColombiaCalendarDate(new Date("2026-11-21T04:59:59.999Z"))).toBe("2026-11-20");
        expect(getColombiaCalendarDate(new Date("2026-11-21T05:00:00.000Z"))).toBe("2026-11-21");
    });
});
