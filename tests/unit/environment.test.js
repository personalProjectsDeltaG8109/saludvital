import { loadEnvironment } from "../../config/environment.js";

// Verify that application and database configuration values are validated.
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
        });
    });

    // Confirm that supported environments and valid ports are accepted.
    test("accepts a supported environment and valid port", () => {
        expect(
            loadEnvironment({
                NODE_ENV: "production",
                PORT: "8080",
                DB_HOST: "127.0.0.1",
                DB_PORT: "3307",
                DB_NAME: "saludvital",
                DB_USER: "root",
                DB_PASSWORD: "example",
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
});
