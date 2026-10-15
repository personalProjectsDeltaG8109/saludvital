import { Sequelize } from "sequelize";
import environment from "./environment.js";

// Configure Sequelize using the validated MySQL connection settings.
const database = new Sequelize(
    environment.database.name,
    environment.database.user,
    environment.database.password,
    {
        host: environment.database.host,
        port: environment.database.port,
        dialect: "mysql",

        // Keep the database session aligned with Colombia's UTC-05:00 time.DATETIME values still require explicit UTC conversion in the application.
        timezone: "-05:00",

        // Disable SQL logging during normal application execution.
        logging: false,
    },
);

// Export the database connection for application modules.
export default database;
