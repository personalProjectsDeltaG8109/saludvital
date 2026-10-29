const SUPPORTED_NOTIFICATION_TEMPLATES = [
    {
        eventType: "appointment_reminder",
        name: "Recordatorio de cita",
        purpose: "Recordar al paciente una cita programada.",
        environmentKey: "META_WHATSAPP_REMINDER_TEMPLATE_NAME",
    },
    {
        eventType: "appointment_reschedule",
        name: "Reprogramación de cita",
        purpose: "Informar al paciente que su cita fue reprogramada.",
        environmentKey: "META_WHATSAPP_RESCHEDULE_TEMPLATE_NAME",
    },
    {
        eventType: "appointment_cancellation",
        name: "Cancelación de cita",
        purpose: "Informar al paciente que su cita fue cancelada.",
        environmentKey: "META_WHATSAPP_CANCELLATION_TEMPLATE_NAME",
    },
];

export function getAdminWhatsAppTemplateConfiguration() {
    return SUPPORTED_NOTIFICATION_TEMPLATES.map((template) => {
        const configured = Boolean(process.env[template.environmentKey]?.trim());
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
