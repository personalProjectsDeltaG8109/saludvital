import { describe, expect, test } from "@jest/globals";
import {
    getDepartments,
    getMunicipalities,
    resolveLocation,
} from "../../src/shared/services/colombiaLocationService.js";
import {
    normalizeProfileEmail,
    normalizeProfilePhone,
    normalizeProfileText,
} from "../../src/shared/services/profileFieldValidationService.js";

describe("shared Colombia location catalog", () => {
    test("returns sorted departments and municipalities from the same catalog", () => {
        const departments = getDepartments();
        const risaralda = departments.find((department) => department.code === "66");
        const municipalities = getMunicipalities("66");

        expect(departments).toHaveLength(33);
        expect(risaralda).toEqual({ code: "66", name: "RISARALDA" });
        expect(municipalities).toHaveLength(14);
        expect(municipalities).toContainEqual({ code: "66001", name: "PEREIRA" });
        expect(municipalities).not.toContainEqual({ code: "05001", name: "MEDELLÍN" });
        expect(departments.map((department) => department.name)).toEqual(
            [...departments.map((department) => department.name)].sort((first, second) =>
                first.localeCompare(second, "es"),
            ),
        );
    });

    test("resolves only a municipality that belongs to the submitted department", () => {
        expect(resolveLocation("66", "66001")).toEqual({
            department: "RISARALDA",
            municipality: "PEREIRA",
        });
        expect(resolveLocation("66", "05001")).toBeNull();
        expect(resolveLocation("unknown", "66001")).toBeNull();
    });

    test("returns empty municipality results for invalid department codes", () => {
        expect(getMunicipalities(undefined)).toEqual([]);
        expect(getMunicipalities("unknown")).toEqual([]);
    });
});

describe("shared administrator and doctor profile field validation", () => {
    test("trims text and normalizes valid email and phone values", () => {
        expect(normalizeProfileText("  Dr. Ana  ", "El nombre", 30, true)).toBe("Dr. Ana");
        expect(normalizeProfileEmail(" PERSON@example.com ")).toBe("person@example.com");
        expect(normalizeProfilePhone("+573001234567", "el teléfono", true)).toBe("+573001234567");
    });

    test("preserves optional empty fields and validates required and malformed values", () => {
        expect(normalizeProfileText("", "La dirección", 150)).toBeNull();
        expect(normalizeProfilePhone("", "el teléfono alternativo", false)).toBeNull();
        expect(() => normalizeProfileText("", "El nombre", 120, true)).toThrow();
        expect(() => normalizeProfileEmail("invalid-email")).toThrow();
        expect(() => normalizeProfilePhone("phone", "el teléfono", true)).toThrow();
        expect(() => normalizeProfileText("x".repeat(151), "La dirección", 150)).toThrow();
    });
});
