import { describe, expect, test } from "@jest/globals";
import { getEnabledChannelStates } from "../../../src/modules/patient/services/notificationChannelRules.js";

describe("notification channel rules", () => {
    test("defaults legacy records without preferences to SMS", () => {
        expect(getEnabledChannelStates([])).toEqual({
            WhatsApp: false,
            SMS: true,
            Email: false,
        });
    });

    test("uses a channel when any persisted event preference enables it", () => {
        expect(
            getEnabledChannelStates([
                { channel: "WhatsApp", is_enabled: false },
                { channel: "WhatsApp", is_enabled: true },
                { channel: "Email", is_enabled: false },
            ]),
        ).toEqual({
            WhatsApp: true,
            SMS: true,
            Email: false,
        });
    });

    test("restores the SMS fallback when every saved channel is disabled", () => {
        expect(
            getEnabledChannelStates([
                { channel: "WhatsApp", is_enabled: false },
                { channel: "SMS", is_enabled: false },
                { channel: "Email", is_enabled: false },
            ]),
        ).toEqual({
            WhatsApp: false,
            SMS: true,
            Email: false,
        });
    });
});
