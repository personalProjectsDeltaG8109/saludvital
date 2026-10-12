
import dotenv from "dotenv";

// Load environment variables from the local .env file when it exists.
dotenv.config();

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

  // Use port 3000 by default and reject invalid TCP port values.
  const port = env.PORT === undefined ? 3000 : Number(env.PORT);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  // Return a normalized configuration object for the application.
  return {
    nodeEnv,
    port,
  };
}

// Export the validated configuration for the server to consume.
const environment = loadEnvironment();

export default environment;
