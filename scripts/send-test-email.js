import "dotenv/config";
import { sendResendEmail } from "../src/modules/patient/services/resendEmailService.js";

const recipient = process.argv[2]?.trim();

if (process.env.NODE_ENV === "production") {
    console.error("Test messages are disabled in production.");
    process.exitCode = 1;
} else if (!recipient) {
    console.error("Usage: node scripts/send-test-email.js recipient@example.com");
    process.exitCode = 1;
} else {
    try {
        const result = await sendResendEmail({
            to: recipient,
            eventType: "appointment_reminder",
            body: "Este es un correo de prueba de SaludVital.",
        });
        console.log(`Resend accepted the email. Provider ID: ${result.id || "unavailable"}`);
        console.log(`Provider response: ${result.status}`);
    } catch (error) {
        console.error(`Email could not be sent: ${error.message}`);
        process.exitCode = 1;
    }
}
