import "dotenv/config";
import { sendWhatsApp } from "../src/modules/patient/services/whatsappService.js";

const recipient = process.argv[2];

if (!recipient) {
    console.error("Usage: node scripts/send-test-whatsapp.js +573001234567");
    process.exitCode = 1;
} else {
    try {
        const result = await sendWhatsApp({
            to: recipient,
        });

        console.log(`WhatsApp sent. Twilio message ID: ${result.id}`);
        console.log(`Current status: ${result.status}`);
    } catch (error) {
        console.error(`WhatsApp could not be sent: ${error.message}`);
        process.exitCode = 1;
    }
}
