import "dotenv/config";
import { sendSms } from "../src/modules/patient/services/smsService.js";

// Read the destination from the command line instead of hard-coding a phone number.
const recipient = process.argv[2];

if (!recipient) {
    console.error("Usage: node scripts/send-test-sms.js +573001234567");
    process.exitCode = 1;
} else {
    try {
        const result = await sendSms({
            to: recipient,
            body: "sms_appointment_reminders",
        });

        console.log(`SMS sent. Twilio message ID: ${result.id}`);
        console.log(`Current status: ${result.status}`);
    } catch (error) {
        // Show the error without printing credentials or configuration values.
        console.error(`SMS could not be sent: ${error.message}`);
        process.exitCode = 1;
    }
}
