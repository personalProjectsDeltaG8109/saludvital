import { createTwilioClient } from "./twilioClient.js";

// Send one SMS to an E.164 phone number, for example +573001234567.
export async function sendSms({ to, body }) {
    const recipient = typeof to === "string" ? to.trim() : "";
    const message = typeof body === "string" ? body.trim() : "";
    const sender = process.env.TWILIO_FROM_NUMBER;

    if (!sender) {
        throw new Error("The Twilio sender number is not configured.");
    }

    if (!/^\+[1-9]\d{7,14}$/.test(recipient)) {
        throw new Error("The recipient must use the international format, such as +573001234567.");
    }

    if (!message || message.length > 1600) {
        throw new Error("The SMS body must contain between 1 and 1600 characters.");
    }

    const client = createTwilioClient();

    // Send the message only when this function is explicitly called.
    const sentMessage = await client.messages.create({
        from: sender,
        to: recipient,
        body: message,
    });

    return {
        id: sentMessage.sid,
        status: sentMessage.status,
    };
}
