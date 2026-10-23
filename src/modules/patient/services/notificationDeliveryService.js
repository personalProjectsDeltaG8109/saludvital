import { sendSms } from "./smsService.js";
import { sendWhatsApp } from "./whatsappService.js";

function messageFor(notification) {
    const { date, time, doctor, specialty } = notification.payload || {};
    const appointment = `el ${date || "día programado"} a las ${time || "hora programada"}`;
    const careTeam = [doctor, specialty].filter(Boolean).join(" · ");
    const details = careTeam ? ` con ${careTeam}` : "";

    if (notification.event_type === "appointment_reminder") {
        return `SaludVital: Te recordamos tu cita ${appointment}${details}.`;
    }
    if (notification.event_type === "appointment_reschedule") {
        return `SaludVital: Tu cita fue reprogramada para ${appointment}${details}.`;
    }
    if (notification.event_type === "appointment_cancellation") {
        return `SaludVital: Tu cita del ${date || "día programado"} fue cancelada.`;
    }
    throw new Error("Unsupported automatic notification event.");
}

function escapeHtml(value) {
    return String(value).replace(
        /[&<>"']/g,
        (character) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[character],
    );
}

async function sendEmail(notification, message) {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_EMAIL_FROM, TWILIO_EMAIL_FROM_NAME } =
        process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_EMAIL_FROM) {
        throw new Error("Twilio email credentials and sender must be configured.");
    }
    const subject = "Actualización de tu cita en SaludVital";
    const response = await fetch("https://comms.twilio.com/v1/Emails", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        },
        body: JSON.stringify({
            from: {
                address: TWILIO_EMAIL_FROM,
                ...(TWILIO_EMAIL_FROM_NAME ? { name: TWILIO_EMAIL_FROM_NAME } : {}),
            },
            to: [{ address: notification.recipient_address }],
            content: {
                subject,
                html: `<p>${escapeHtml(message)}</p><p>SaludVital</p>`,
            },
        }),
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
        const apiError = responseBody.message || responseBody.error || `HTTP ${response.status}`;
        throw new Error(`Twilio email request failed: ${String(apiError).slice(0, 300)}`);
    }
    return {
        id:
            responseBody.id ||
            responseBody.operation_id ||
            response.headers.get("location") ||
            null,
        status: "accepted",
    };
}

// Route queued notifications through the configured Twilio product for each channel.
export async function deliverNotification(notification) {
    const message = messageFor(notification);
    if (notification.channel === "SMS") {
        return sendSms({ to: notification.recipient_address, body: message });
    }
    if (notification.channel === "WhatsApp") {
        const eventVariablesKey = {
            appointment_reminder: "TWILIO_WHATSAPP_REMINDER_VARIABLES",
            appointment_reschedule: "TWILIO_WHATSAPP_RESCHEDULE_VARIABLES",
            appointment_cancellation: "TWILIO_WHATSAPP_CANCELLATION_VARIABLES",
        }[notification.event_type];
        return sendWhatsApp({
            to: notification.recipient_address,
            eventType: notification.event_type,
            contentVariables: process.env[eventVariablesKey] || {
                1: notification.payload?.date || "",
                2: notification.payload?.time || "",
            },
        });
    }
    if (notification.channel === "Email") return sendEmail(notification, message);
    throw new Error("Unsupported notification channel.");
}
