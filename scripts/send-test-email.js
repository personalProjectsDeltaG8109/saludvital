import "dotenv/config";

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
const fromAddress = process.env.TWILIO_EMAIL_FROM;
const fromName = process.env.TWILIO_EMAIL_FROM_NAME || "Trial with Twilio";
const recipient = process.argv[2]?.trim() || process.env.TWILIO_EMAIL_TO;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !fromAddress || !recipient) {
    console.error(
        "Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_EMAIL_FROM and TWILIO_EMAIL_TO in .env.",
    );
    process.exitCode = 1;
} else {
    try {
        const authorization = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString(
            "base64",
        );
        const response = await fetch("https://comms.twilio.com/v1/Emails", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Basic ${authorization}`,
            },
            body: JSON.stringify({
                from: { address: fromAddress, name: fromName },
                to: [{ address: recipient }],
                content: {
                    subject: "Your Order Has Been Confirmed!",
                    html: "<p><b>This is a test email from Twilio.</b></p><h2>Thank you for your order!</h2><p>We are excited to let you know that your order has been confirmed and is being processed.</p><p>You will receive a shipping confirmation email once your items are on their way.</p><p>Order Number: #12345</p><p>Thank you for shopping with us!</p><p>Best regards,<br/>The Team</p>",
                },
            }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const details = JSON.stringify(data) || response.statusText;
            const requestId =
                response.headers.get("twilio-request-id") ||
                response.headers.get("x-twilio-request-id");
            const code = data.code ? ` (Twilio ${data.code})` : "";
            const trace = requestId ? `; Request ID: ${requestId}` : "";
            throw new Error(`HTTP ${response.status}${code}: ${details}${trace}`);
        }

        console.log(`Twilio accepted the email request (HTTP ${response.status}).`);
        if (data.operationId) console.log(`Operation ID: ${data.operationId}`);
        if (data.operationLocation) console.log(`Status URL: ${data.operationLocation}`);
    } catch (error) {
        console.error(`Email could not be sent: ${error.message}`);
        process.exitCode = 1;
    }
}
