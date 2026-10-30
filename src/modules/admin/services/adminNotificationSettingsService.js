const CHANNEL_CONFIGURATION = [
    {
        key: "whatsapp",
        provider: "Meta WhatsApp Cloud API",
        requiredEnvironmentVariables: [
            "META_WHATSAPP_ACCESS_TOKEN",
            "META_WHATSAPP_PHONE_NUMBER_ID",
            "META_WHATSAPP_API_VERSION",
            "META_WHATSAPP_TEMPLATE_LANGUAGE",
            "META_WHATSAPP_REMINDER_TEMPLATE_NAME",
            "META_WHATSAPP_RESCHEDULE_TEMPLATE_NAME",
            "META_WHATSAPP_CANCELLATION_TEMPLATE_NAME",
        ],
        configuredDetails: [
            ["META_WHATSAPP_ACCESS_TOKEN", "Credenciales de acceso"],
            ["META_WHATSAPP_PHONE_NUMBER_ID", "Número emisor configurado"],
            ["META_WHATSAPP_BUSINESS_ACCOUNT_ID", "Cuenta empresarial configurada"],
            ["META_WHATSAPP_API_VERSION", "Versión de API"],
            ["META_WHATSAPP_TEMPLATE_LANGUAGE", "Idioma de plantillas"],
            ["META_WHATSAPP_REMINDER_TEMPLATE_NAME", "Plantilla de recordatorio"],
            ["META_WHATSAPP_RESCHEDULE_TEMPLATE_NAME", "Plantilla de reprogramación"],
            ["META_WHATSAPP_CANCELLATION_TEMPLATE_NAME", "Plantilla de cancelación"],
            ["META_WHATSAPP_APP_SECRET", "Firma de eventos configurada"],
            ["META_WHATSAPP_WEBHOOK_VERIFY_TOKEN", "Verificación local del webhook"],
        ],
    },
    {
        key: "email",
        provider: "Resend",
        requiredEnvironmentVariables: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"],
        configuredDetails: [
            ["RESEND_API_KEY", "Credenciales de acceso"],
            ["RESEND_FROM_EMAIL", "Remitente configurado"],
            ["RESEND_FROM_NAME", "Nombre del remitente"],
        ],
    },
    {
        key: "sms",
        provider: "Inalambria Express",
        requiredEnvironmentVariables: ["INALAMBRIA_API_KEY"],
        configuredDetails: [["INALAMBRIA_API_KEY", "Credenciales de acceso"]],
    },
];

function isEnvironmentValueConfigured(name) {
    return Boolean(process.env[name]?.trim());
}

function mapChannelConfiguration(channel, deliveryEnabled) {
    const configured = channel.requiredEnvironmentVariables.every(isEnvironmentValueConfigured);

    return {
        key: channel.key,
        provider: channel.provider,
        configurationStatus: configured ? "configured" : "incomplete",
        configurationLabel: configured ? "Configuración detectada" : "Configuración incompleta",
        operationStatus: !deliveryEnabled ? "disabled" : configured ? "unverified" : "unavailable",
        operationLabel: !deliveryEnabled
            ? "Procesamiento global desactivado"
            : configured
              ? "Conexión no verificada"
              : "No disponible con la configuración actual",
        editable: false,
        settings: channel.configuredDetails.map(([environmentVariable, label]) => ({
            label,
            configured: isEnvironmentValueConfigured(environmentVariable),
        })),
    };
}

export function getAdminNotificationSettings() {
    const deliveryEnabled = process.env.NOTIFICATION_DELIVERY_ENABLED === "true";

    return {
        deliveryEnabled,
        deliveryLabel: deliveryEnabled ? "Activada" : "Desactivada",
        channels: CHANNEL_CONFIGURATION.map((channel) =>
            mapChannelConfiguration(channel, deliveryEnabled),
        ),
        editable: false,
        configurationSource: "environment",
    };
}
