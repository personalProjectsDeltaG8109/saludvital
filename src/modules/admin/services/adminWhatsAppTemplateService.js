const SUPPORTED_NOTIFICATION_TEMPLATES = [
    {
        eventType: "appointment_reminder",
        name: "Recordatorio de cita",
        purpose: "Recordar al paciente una cita programada.",
        contentSidEnvironmentKeys: [
            "TWILIO_WHATSAPP_REMINDER_CONTENT_SID",
            "TWILIO_WHATSAPP_CONTENT_SID",
        ],
    },
    {
        eventType: "appointment_reschedule",
        name: "Reprogramación de cita",
        purpose: "Informar al paciente que su cita fue reprogramada.",
        contentSidEnvironmentKeys: ["TWILIO_WHATSAPP_RESCHEDULE_CONTENT_SID"],
    },
    {
        eventType: "appointment_cancellation",
        name: "Cancelación de cita",
        purpose: "Informar al paciente que su cita fue cancelada.",
        contentSidEnvironmentKeys: ["TWILIO_WHATSAPP_CANCELLATION_CONTENT_SID"],
    },
];

function isTemplateConfigured(environmentKeys) {
    return environmentKeys.some((key) => Boolean(process.env[key]?.trim()));
}

export function getAdminWhatsAppTemplateConfiguration() {
    return SUPPORTED_NOTIFICATION_TEMPLATES.map((template) => {
        const configured = isTemplateConfigured(template.contentSidEnvironmentKeys);

        return {
            eventType: template.eventType,
            name: template.name,
            purpose: template.purpose,
            configured,
            configurationStatus: configured ? "Configured" : "NotConfigured",
            providerStatus: "Unknown",
        };
    });
}
