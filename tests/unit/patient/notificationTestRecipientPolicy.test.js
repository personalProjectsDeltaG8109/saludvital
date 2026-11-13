import { describe, expect, test } from "@jest/globals";
import {
    getTestRecipientAllowlist,
    isTestRecipientAllowed,
} from "../../../src/modules/patient/services/notificationTestRecipientPolicy.js";

describe("notification test-recipient policy", () => {
    test("parses comma-separated recipients and ignores whitespace and empty values", () => {
        const recipients = getTestRecipientAllowlist({
            NOTIFICATION_TEST_RECIPIENTS: " first@example.test, , +573001234567 ",
        });

        expect([...recipients]).toEqual(["first@example.test", "+573001234567"]);
    });

    test("matches email addresses without case sensitivity", () => {
        expect(
            isTestRecipientAllowed(" First@Example.Test ", {
                NOTIFICATION_TEST_RECIPIENTS: "first@example.test",
            }),
        ).toBe(true);
    });

    test("does not match partial or absent recipients", () => {
        const environment = { NOTIFICATION_TEST_RECIPIENTS: "first@example.test" };

        expect(isTestRecipientAllowed("other@example.test", environment)).toBe(false);
        expect(isTestRecipientAllowed("", environment)).toBe(false);
    });
});
