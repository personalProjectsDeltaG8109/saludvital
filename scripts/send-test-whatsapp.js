import "dotenv/config";
import { sendWhatsApp } from "../src/modules/patient/services/whatsappService.js";

const recipient = process.argv[2];

if (process.env.NODE_ENV === "production") {
    console.error("Test messages are disabled in production.");
    process.exitCode = 1;
} else if (!recipient) {
    console.error("Usage: node scripts/send-test-whatsapp.js +573001234567");
    process.exitCode = 1;
} else {
    try {
        const result = await sendWhatsApp({
            to: recipient,
            eventType: "appointment_reminder",
            contentVariables: ["fecha de prueba", "hora de prueba"],
        });

        console.log(
            `Meta accepted the WhatsApp message. Provider ID: ${result.id || "unavailable"}`,
        );
        console.log(`Provider response: ${result.status}`);
    } catch (error) {
        console.error(`WhatsApp could not be sent: ${error.message}`);
        process.exitCode = 1;
    }
}
