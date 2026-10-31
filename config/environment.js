import dotenv from "dotenv";

// Load local environment variables without verbose informational output.
dotenv.config({ quiet: true });

// Validate and normalize the application environment configuration.
export function loadEnvironment(env = process.env) {
    // Restrict the application to supported execution environments.
    const nodeEnv = env.NODE_ENV || "development";
    const supportedEnvironments = ["development", "test", "production"];

    if (!supportedEnvironments.includes(nodeEnv)) {
        throw new Error(
            `Invalid NODE_ENV value: ${nodeEnv}. Use development, test, or production.`,
        );
    }

    // Validate the HTTP server port.
    const port = env.PORT === undefined ? 3000 : Number(env.PORT);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("PORT must be an integer between 1 and 65535.");
    }

    const unverifiedRegistrationRetentionMinutes =
        env.UNVERIFIED_REGISTRATION_RETENTION_MINUTES === undefined
            ? 30
            : Number(env.UNVERIFIED_REGISTRATION_RETENTION_MINUTES);

    if (
        !Number.isInteger(unverifiedRegistrationRetentionMinutes) ||
        unverifiedRegistrationRetentionMinutes < 30 ||
        unverifiedRegistrationRetentionMinutes > 525600
    ) {
        throw new Error(
            "UNVERIFIED_REGISTRATION_RETENTION_MINUTES must be an integer between 30 and 525600.",
        );
    }

    // Normalize the database connection settings.
    const database = {
        host: env.DB_HOST || "localhost",
        port: env.DB_PORT === undefined ? 3306 : Number(env.DB_PORT),
        name: env.DB_NAME || "",
        user: env.DB_USER || "",
        password: env.DB_PASSWORD || "",
    };

    // Validate the database port.
    if (!Number.isInteger(database.port) || database.port < 1 || database.port > 65535) {
        throw new Error("DB_PORT must be an integer between 1 and 65535.");
    }

    // Normalize the JWT configuration used for authentication.
    const jwt = {
        secret: env.JWT_SECRET || "",
        expiresIn: env.JWT_EXPIRES_IN || "15m",
    };

    // Require a sufficiently long secret outside automated tests.
    if (nodeEnv === "production" && jwt.secret.length < 32) {
        throw new Error("JWT_SECRET must contain at least 32 characters in production.");
    }

    // Require an explicit test secret to avoid using production credentials.
    if (nodeEnv === "test" && !jwt.secret) {
        throw new Error("JWT_SECRET must be configured in the test environment.");
    }

    // Prevent automated tests from targeting the development or production database.
    if (nodeEnv === "test" && database.name !== "saludvital_test") {
        throw new Error("DB_NAME must be saludvital_test in the test environment.");
    }

    // Return the normalized application and database configuration.
    return {
        nodeEnv,
        port,
        unverifiedRegistrationRetentionMinutes,
        database,
        jwt,
    };
}

// Export the validated configuration for the application to consume.
const environment = loadEnvironment();

export default environment;
