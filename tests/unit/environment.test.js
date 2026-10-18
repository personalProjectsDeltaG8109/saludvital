import { loadEnvironment } from "../../config/environment.js";

// Verify that application, database, and JWT configuration values are validated.
describe("Environment configuration", () => {
    // Confirm default values when no configuration is supplied.
    test("uses default values when configuration is missing", () => {
        expect(loadEnvironment({})).toEqual({
            nodeEnv: "development",
            port: 3000,
            database: {
                host: "localhost",
                port: 3306,
                name: "",
                user: "",
                password: "",
            },
            jwt: {
                secret: "",
                expiresIn: "15m",
            },
        });
    });

    // Confirm that supported environments and valid configuration are accepted.
    test("accepts a supported environment and valid configuration", () => {
        expect(
            loadEnvironment({
                NODE_ENV: "production",
                PORT: "8080",
                DB_HOST: "127.0.0.1",
                DB_PORT: "3307",
                DB_NAME: "saludvital",
                DB_USER: "root",
                DB_PASSWORD: "example",
                JWT_SECRET: "test_secret_with_at_least_32_characters",
                JWT_EXPIRES_IN: "20m",
            }),
        ).toEqual({
            nodeEnv: "production",
            port: 8080,
            database: {
                host: "127.0.0.1",
                port: 3307,
                name: "saludvital",
                user: "root",
                password: "example",
            },
            jwt: {
                secret: "test_secret_with_at_least_32_characters",
                expiresIn: "20m",
            },
        });
    });

    // Reject unsupported execution environments.
    test("rejects an unsupported environment", () => {
        expect(() => loadEnvironment({ NODE_ENV: "staging" })).toThrow(
            "Invalid NODE_ENV value: staging. Use development, test, or production.",
        );
    });

    // Reject ports that are not numeric integers.
    test("rejects a non-numeric HTTP port", () => {
        expect(() => loadEnvironment({ PORT: "invalid" })).toThrow(
            "PORT must be an integer between 1 and 65535.",
        );
    });

    // Reject HTTP ports outside the valid TCP port range.
    test("rejects an out-of-range HTTP port", () => {
        expect(() => loadEnvironment({ PORT: "70000" })).toThrow(
            "PORT must be an integer between 1 and 65535.",
        );
    });

    // Reject database ports outside the valid TCP port range.
    test("rejects an invalid database port", () => {
        expect(() => loadEnvironment({ DB_PORT: "70000" })).toThrow(
            "DB_PORT must be an integer between 1 and 65535.",
        );
    });

    // Require a sufficiently long JWT secret in production.
    test("rejects a short JWT secret in production", () => {
        expect(() =>
            loadEnvironment({
                NODE_ENV: "production",
                JWT_SECRET: "short-secret",
            }),
        ).toThrow("JWT_SECRET must contain at least 32 characters in production.");
    });

    // Require an explicit JWT secret in the test environment.
    test("rejects a missing JWT secret in the test environment", () => {
        expect(() => loadEnvironment({ NODE_ENV: "test" })).toThrow(
            "JWT_SECRET must be configured in the test environment.",
        );
    });

    // Reject the development database when running automated tests.
    test("rejects the development database in the test environment", () => {
        expect(() =>
            loadEnvironment({
                NODE_ENV: "test",
                JWT_SECRET: "test-secret",
                DB_NAME: "saludvital",
            }),
        ).toThrow("DB_NAME must be saludvital_test in the test environment.");
    });

    // Accept the dedicated database when running automated tests.
    test("accepts the dedicated test database", () => {
        expect(
            loadEnvironment({
                NODE_ENV: "test",
                JWT_SECRET: "test-secret",
                DB_NAME: "saludvital_test",
            }).database.name,
        ).toBe("saludvital_test");
    });
});
