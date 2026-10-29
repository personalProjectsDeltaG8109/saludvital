import "dotenv/config";
import { sendSms } from "../src/modules/patient/services/smsService.js";

// Read the destination from the command line instead of hard-coding a phone number.
const recipient = process.argv[2];

if (process.env.NODE_ENV === "production") {
    console.error("Test messages are disabled in production.");
    process.exitCode = 1;
} else if (!recipient) {
    console.error("Usage: node scripts/send-test-sms.js +573001234567");
    process.exitCode = 1;
} else {
    try {
        const result = await sendSms({
            to: recipient,
            body: "SaludVital: este es un mensaje de prueba.",
        });

        console.log(`Inalambria accepted the SMS. Job ID: ${result.id || "unavailable"}`);
        console.log(`Provider response: ${result.status}`);
    } catch (error) {
        // Show the error without printing credentials or configuration values.
        console.error(`SMS could not be sent: ${error.message}`);
        process.exitCode = 1;
    }
}
