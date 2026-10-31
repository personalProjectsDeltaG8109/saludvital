import { describe, expect, test } from "@jest/globals";
import { isValidPassword } from "../../../src/modules/auth/services/passwordPolicy.js";

describe("new password policy", () => {
    test("accepts passwords within the length and bcrypt byte limits", () => {
        expect(isValidPassword("SecurePass123!")).toBe(true);
        expect(isValidPassword(`Aa${"b".repeat(45)}1!`)).toBe(true);
    });

    test("rejects passwords outside the character limit", () => {
        expect(isValidPassword(`Aa${"b".repeat(47)}1!`)).toBe(false);
        expect(isValidPassword("Short1!")).toBe(false);
    });

    test("rejects passwords that exceed bcrypt's UTF-8 byte limit", () => {
        expect(isValidPassword(`Abc1!${"é".repeat(34)}`)).toBe(false);
    });

    test("rejects non-string values", () => {
        expect(isValidPassword(null)).toBe(false);
        expect(isValidPassword(123)).toBe(false);
    });
});
