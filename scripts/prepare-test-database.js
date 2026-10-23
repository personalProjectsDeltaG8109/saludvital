import { spawnSync } from "node:child_process";

// Restrict database preparation to the dedicated test database.
process.env.NODE_ENV = "test";
process.env.DB_NAME = "saludvital_test";

// Resolve the local Sequelize CLI executable for Windows and Unix.
const sequelizeCli =
    process.platform === "win32"
        ? "node_modules/sequelize-cli/lib/sequelize"
        : "node_modules/.bin/sequelize-cli";

// Run each database command with the validated test environment.
function runDatabaseCommand(args) {
    const result = spawnSync(process.execPath, [sequelizeCli, ...args], {
        stdio: "inherit",
        env: {
            ...process.env,
            NODE_ENV: "test",
            DB_NAME: "saludvital_test",
        },
    });

    // Stop immediately if a migration or seeder fails.
    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

// Apply all pending migrations to the dedicated test database.
runDatabaseCommand(["db:migrate"]);

// Insert only the initial application roles, never development users.
runDatabaseCommand(["db:seed", "--seed", "20261014230143-initial-roles.js"]);
