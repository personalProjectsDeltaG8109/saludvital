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

    // Return the normalized application and database configuration.
    return {
        nodeEnv,
        port,
        database,
    };
}

// Export the validated configuration for the application to consume.
const environment = loadEnvironment();

export default environment;
