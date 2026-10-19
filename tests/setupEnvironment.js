import dotenv from "dotenv";

// Load the local environment variables before importing application modules.
dotenv.config({ quiet: true });

// Select the dedicated test database before Sequelize is initialized.
process.env.NODE_ENV = "test";
process.env.DB_NAME = "saludvital_test";

// Require an explicit test secret without using production credentials.
if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = "local-test-secret-not-for-production";
}
