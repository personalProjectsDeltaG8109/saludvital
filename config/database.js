import { Sequelize } from "sequelize";
import environment from "./environment.js";

// Configure Sequelize using the validated MariaDB connection settings.
const database = new Sequelize(
    environment.database.name,
    environment.database.user,
    environment.database.password,
    {
        host: environment.database.host,
        port: environment.database.port,
        dialect: "mysql",
        logging: false,
    },
);

// Export the database connection for application modules.
export default database;
