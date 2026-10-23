import twilio from "twilio";

// Create the Twilio client only when a message is requested.
export function createTwilioClient() {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
        throw new Error("Twilio is not configured. Check the server environment variables.");
    }

    return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}
