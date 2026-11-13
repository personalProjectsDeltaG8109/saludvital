import { describe, expect, jest, test } from "@jest/globals";
import { startApplicationSchedulers } from "../../../src/shared/services/schedulerStartup.js";

describe("application scheduler startup", () => {
    test("does not start background jobs in test servers", () => {
        const startEmailScheduler = jest.fn();
        const startNotificationScheduler = jest.fn();

        const started = startApplicationSchedulers({
            nodeEnv: "test",
            schedulers: [startEmailScheduler, startNotificationScheduler],
        });

        expect(started).toBe(false);
        expect(startEmailScheduler).not.toHaveBeenCalled();
        expect(startNotificationScheduler).not.toHaveBeenCalled();
    });

    test("starts each background job outside test servers", () => {
        const startEmailScheduler = jest.fn();
        const startNotificationScheduler = jest.fn();

        const started = startApplicationSchedulers({
            nodeEnv: "development",
            schedulers: [startEmailScheduler, startNotificationScheduler],
        });

        expect(started).toBe(true);
        expect(startEmailScheduler).toHaveBeenCalledTimes(1);
        expect(startNotificationScheduler).toHaveBeenCalledTimes(1);
    });
});
