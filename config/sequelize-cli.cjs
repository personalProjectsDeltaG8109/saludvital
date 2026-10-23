require("dotenv").config();

// Resolve the database configuration before allowing Sequelize CLI operations.
const nodeEnv = process.env.NODE_ENV || "development";
const databaseName = process.env.DB_NAME;
const testDatabaseName = "saludvital_test";

// Prevent test migrations from targeting the development or production database.
if (nodeEnv === "test" && databaseName !== testDatabaseName) {
    throw new Error(`DB_NAME must be ${testDatabaseName} when NODE_ENV=test.`);
}

// Require an explicit database name for every supported environment.
if (!databaseName) {
    throw new Error("DB_NAME must be configured before running Sequelize CLI.");
}

// Configure Sequelize CLI using the validated environment variables.
module.exports = {
    development: {
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD || "",
        database: databaseName,
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT || 3306),
        dialect: "mysql",
        timezone: "-05:00",
    },
    test: {
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD || "",
        database: testDatabaseName,
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT || 3306),
        dialect: "mysql",
        timezone: "-05:00",
    },
    production: {
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: databaseName,
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        dialect: "mysql",
        timezone: "-05:00",
    },
};
