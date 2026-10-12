
import { loadEnvironment } from "../../config/environment.js";

// Verify that environment configuration values are normalized correctly.
describe("Environment configuration", () => {
    // Use the default development environment and port when values are absent.
    test("uses default values when configuration is missing", () => {
        expect(loadEnvironment({})).toEqual({
            nodeEnv: "development",
            port: 3000,
        });
    });

    // Accept supported environments and valid TCP ports.
    test("accepts a supported environment and valid port", () => {
        expect(
            loadEnvironment({
                NODE_ENV: "production",
                PORT: "8080",
            }),
        ).toEqual({
            nodeEnv: "production",
            port: 8080,
        });
    });

    // Reject environment names that the application does not support.
    test("rejects an unsupported environment", () => {
        expect(() => loadEnvironment({ NODE_ENV: "staging" })).toThrow(
            "Invalid NODE_ENV value",
        );
    });

    // Reject non-numeric ports.
    test("rejects a non-numeric port", () => {
        expect(() => loadEnvironment({ PORT: "abc" })).toThrow(
            "PORT must be an integer",
        );
    });

    // Reject ports outside the valid TCP range.
    test("rejects a port outside the valid range", () => {
        expect(() => loadEnvironment({ PORT: "70000" })).toThrow(
            "PORT must be an integer",
        );
    });
});
