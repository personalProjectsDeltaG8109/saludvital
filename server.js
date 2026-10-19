import app from "./app.js";
import database from "./config/database.js";
import environment from "./config/environment.js";
import {
    startEmailOutboxScheduler,
    stopEmailOutboxScheduler,
} from "./src/modules/auth/services/emailOutboxScheduler.js";

// Start the application only after the database connection succeeds.
async function startServer() {
    await database.authenticate();

    const server = app.listen(environment.port, () => {
        console.log(`SaludVital server running at http://localhost:${environment.port}`);

        // Start processing email jobs after the server starts.
        startEmailOutboxScheduler();
    });

    // Handle graceful shutdown requests from the operating system.
    let shuttingDown = false;

    const shutdown = async (signal) => {
        if (shuttingDown) {
            return;
        }

        shuttingDown = true;
        console.log(`Received ${signal}. Shutting down SaludVital.`);

        try {
            // Stop scheduling email jobs and wait for the active batch.
            await stopEmailOutboxScheduler();

            // Stop accepting requests before closing the database connection.
            await new Promise((resolve, reject) => {
                server.close((error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });

            await database.close();
            console.log("SaludVital shut down successfully.");
        } catch (error) {
            console.error("SaludVital shutdown failed.", {
                error: error instanceof Error ? error.message : "Unknown error",
            });

            process.exitCode = 1;
        }
    };

    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

// Report startup failures without exposing credentials or connection details.
startServer().catch((error) => {
    console.error("SaludVital failed to start.", {
        error: error instanceof Error ? error.message : "Unknown error",
    });

    process.exitCode = 1;
});
