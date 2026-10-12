import database from "../config/database.js";

// Test the database connection without changing any database tables.
try {
    await database.authenticate();
    console.log("Database connection established successfully.");
} catch (error) {
    console.error("Unable to connect to the database:", error.message);
    process.exitCode = 1;
} finally {
    await database.close();
}
