import { createTwilioClient } from "./twilioClient.js";

// Send one WhatsApp message through a Twilio WhatsApp sender or Sandbox.
export async function sendWhatsApp({ to }) {
    const recipient = typeof to === "string" ? to.trim() : "";
    const contentSid = process.env.TWILIO_WHATSAPP_CONTENT_SID?.trim();
    const contentVariables = process.env.TWILIO_WHATSAPP_CONTENT_VARIABLES?.trim();
    const configuredSender = process.env.TWILIO_WHATSAPP_FROM;

    if (!configuredSender) {
        throw new Error("The Twilio WhatsApp sender is not configured. Set TWILIO_WHATSAPP_FROM.");
    }
    if (!contentSid) {
        throw new Error(
            "Twilio requires a WhatsApp template for this message. Set TWILIO_WHATSAPP_CONTENT_SID.",
        );
    }

    const sender = configuredSender.startsWith("whatsapp:")
        ? configuredSender
        : `whatsapp:${configuredSender}`;
    const whatsappRecipient = recipient.startsWith("whatsapp:")
        ? recipient.slice("whatsapp:".length)
        : recipient;

    if (!/^\+[1-9]\d{7,14}$/.test(whatsappRecipient)) {
        throw new Error(
            "The WhatsApp recipient must use international format, such as +573001234567.",
        );
    }

    const messageOptions = {
        from: sender,
        to: `whatsapp:${whatsappRecipient}`,
        contentSid,
    };

    if (contentVariables) {
        let parsedVariables;
        try {
            parsedVariables = JSON.parse(contentVariables);
        } catch {
            throw new Error("TWILIO_WHATSAPP_CONTENT_VARIABLES must be valid JSON.");
        }
        if (
            parsedVariables &&
            typeof parsedVariables === "object" &&
            Object.keys(parsedVariables).length > 0
        ) {
            messageOptions.contentVariables = JSON.stringify(parsedVariables);
        }
    }

    const sentMessage = await createTwilioClient().messages.create(messageOptions);

    return { id: sentMessage.sid, status: sentMessage.status };
}
