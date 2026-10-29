import { sendResendEmail } from "./resendEmailService.js";
import { sendSms } from "./smsService.js";
import { sendWhatsApp } from "./whatsappService.js";

const TEMPLATE_PARAMETER_FIELDS = {
    appointment_reminder: ["date", "time"],
    appointment_reschedule: ["date", "time"],
    appointment_cancellation: ["date"],
};

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

function templateParametersFor(notification) {
    const fields = TEMPLATE_PARAMETER_FIELDS[notification.event_type];
    if (!fields) throw new Error("Unsupported WhatsApp notification event.");
    return fields.map((field) => String(notification.payload?.[field] || ""));
}

export async function deliverNotification(notification) {
    const message = messageFor(notification);

    if (notification.channel === "SMS") {
        return sendSms({ to: notification.recipient_address, body: message });
    }
    if (notification.channel === "WhatsApp") {
        return sendWhatsApp({
            to: notification.recipient_address,
            eventType: notification.event_type,
            contentVariables: templateParametersFor(notification),
        });
    }
    if (notification.channel === "Email") {
        return sendResendEmail({
            to: notification.recipient_address,
            eventType: notification.event_type,
            body: message,
        });
    }
    throw new Error("Unsupported notification channel.");
}
