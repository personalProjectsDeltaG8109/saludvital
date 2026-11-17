import { describe, expect, test } from "@jest/globals";
import {
    getSafeErrorDiagnostics,
    serializeSafeErrorDiagnostic,
} from "../../src/shared/services/safeErrorDiagnostics.js";

describe("safe error diagnostics", () => {
    test("keeps a provider failure useful without copying sensitive error text", () => {
        const error = Object.assign(
            new Error("Bearer fake-token patient@example.test clinical-marker"),
            { statusCode: 503 },
        );

        expect(getSafeErrorDiagnostics(error)).toEqual({
            category: "provider_temporary_failure",
            httpStatus: 503,
        });
        expect(serializeSafeErrorDiagnostic(error)).toBe("provider_temporary_failure:http_503");
        expect(JSON.stringify(getSafeErrorDiagnostics(error))).not.toMatch(
            /fake-token|patient@example\.test|clinical-marker/,
        );
    });

    test("uses fixed categories for rejected, uncertain, and unexpected errors", () => {
        expect(getSafeErrorDiagnostics({ deliveryOutcome: "rejected" })).toMatchObject({
            category: "provider_rejected",
        });
        expect(getSafeErrorDiagnostics({ deliveryOutcome: "unknown" })).toMatchObject({
            category: "delivery_outcome_unknown",
        });
        expect(getSafeErrorDiagnostics(new Error("database details"))).toMatchObject({
            category: "unexpected_error",
        });
    });

    test("does not accept malformed or out-of-range HTTP status values", () => {
        expect(getSafeErrorDiagnostics({ statusCode: 999 })).toEqual({
            category: "unexpected_error",
            httpStatus: null,
        });
        expect(getSafeErrorDiagnostics({ statusCode: "403 secret-token" })).toEqual({
            category: "unexpected_error",
            httpStatus: null,
        });
    });
});
