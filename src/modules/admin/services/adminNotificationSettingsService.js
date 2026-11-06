const CHANNEL_CONFIGURATION = [
    {
        key: "whatsapp",
        provider: "Meta WhatsApp Cloud API",
        requiredEnvironmentVariables: [
            "META_WHATSAPP_ACCESS_TOKEN",
            "META_WHATSAPP_PHONE_NUMBER_ID",
            "META_WHATSAPP_API_VERSION",
            "META_WHATSAPP_TEMPLATE_LANGUAGE",
            "META_WHATSAPP_CONFIRMATION_TEMPLATE_NAME",
            "META_WHATSAPP_REMINDER_TEMPLATE_NAME",
            "META_WHATSAPP_RESCHEDULE_TEMPLATE_NAME",
            "META_WHATSAPP_CANCELLATION_TEMPLATE_NAME",
        ],
        configuredDetails: [
            ["META_WHATSAPP_ACCESS_TOKEN", "Credenciales de acceso"],
            ["META_WHATSAPP_PHONE_NUMBER_ID", "Número emisor configurado"],
            ["META_WHATSAPP_BUSINESS_ACCOUNT_ID", "WABA ID opcional (metadato)"],
            ["META_WHATSAPP_API_VERSION", "Versión de API"],
            ["META_WHATSAPP_TEMPLATE_LANGUAGE", "Idioma de plantillas"],
            ["META_WHATSAPP_CONFIRMATION_TEMPLATE_NAME", "Plantilla de confirmación"],
            ["META_WHATSAPP_REMINDER_TEMPLATE_NAME", "Plantilla de recordatorio"],
            ["META_WHATSAPP_RESCHEDULE_TEMPLATE_NAME", "Plantilla de reprogramación"],
            ["META_WHATSAPP_CANCELLATION_TEMPLATE_NAME", "Plantilla de cancelación"],
        ],
        // Webhook secrets verify callbacks; they are not outbound send prerequisites.
        webhookEnvironmentVariables: [
            "META_WHATSAPP_APP_SECRET",
            "META_WHATSAPP_WEBHOOK_VERIFY_TOKEN",
        ],
        webhookDetails: [
            ["META_WHATSAPP_APP_SECRET", "Firma de eventos"],
            ["META_WHATSAPP_WEBHOOK_VERIFY_TOKEN", "Token de verificación"],
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
    const value = process.env[name]?.trim();
    if (!value) return false;

    return (
        !/^(your_|replace_with|change_me|changeme|placeholder\b)/i.test(value) &&
        !/@example\.(com|org|test)\b/i.test(value)
    );
}

function inspectEnvironmentVariables(names) {
    return {
        configured: names.every(isEnvironmentValueConfigured),
        missing: names.filter((name) => !isEnvironmentValueConfigured(name)),
    };
}

function mapChannelConfiguration(channel, deliveryEnabled) {
    const sendConfiguration = inspectEnvironmentVariables(channel.requiredEnvironmentVariables);
    const webhookConfiguration = channel.webhookEnvironmentVariables
        ? inspectEnvironmentVariables(channel.webhookEnvironmentVariables)
        : null;
    const configured = sendConfiguration.configured;

    return {
        key: channel.key,
        provider: channel.provider,
        configurationStatus: configured ? "configured" : "incomplete",
        configurationLabel: configured
            ? "Configuración de envío completa"
            : "Configuración de envío incompleta",
        operationStatus: !deliveryEnabled ? "disabled" : configured ? "unverified" : "unavailable",
        operationLabel: !deliveryEnabled
            ? "Procesamiento global desactivado"
            : configured
              ? "Conexión no verificada"
              : "No disponible con la configuración actual",
        editable: false,
        webhook: webhookConfiguration
            ? {
                  status: webhookConfiguration.configured ? "configured" : "incomplete",
                  label: webhookConfiguration.configured
                      ? "Configuración de webhook completa"
                      : "Configuración de webhook incompleta",
                  settings: channel.webhookDetails.map(([environmentVariable, label]) => ({
                      label,
                      configured: isEnvironmentValueConfigured(environmentVariable),
                  })),
              }
            : null,
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

export function getNotificationProviderPreflight() {
    const deliveryEnabled = process.env.NOTIFICATION_DELIVERY_ENABLED === "true";
    const chatbotRuntimeEnabled =
        process.env.NODE_ENV !== "production" && process.env.WHATSAPP_CHATBOT_ENABLED !== "false";
    const chatbotVerificationReady = isEnvironmentValueConfigured("WHATSAPP_VERIFICATION_SECRET");

    return {
        deliveryEnabled,
        chatbot: {
            runtimeEnabled: chatbotRuntimeEnabled,
            identityVerificationReady: chatbotVerificationReady,
            missingVariables: chatbotVerificationReady ? [] : ["WHATSAPP_VERIFICATION_SECRET"],
        },
        channels: CHANNEL_CONFIGURATION.map((channel) => {
            const send = inspectEnvironmentVariables(channel.requiredEnvironmentVariables);
            const webhook = channel.webhookEnvironmentVariables
                ? inspectEnvironmentVariables(channel.webhookEnvironmentVariables)
                : null;

            return {
                key: channel.key,
                provider: channel.provider,
                sendReady: send.configured,
                missingSendVariables: send.missing,
                webhookReady: webhook?.configured ?? null,
                missingWebhookVariables: webhook?.missing ?? [],
            };
        }),
        manualChecks: [
            "Meta: confirmar aprobación de las cuatro plantillas y sus variables e idioma.",
            "Meta: publicar el webhook HTTPS, suscribirse a messages y validar callbacks reales.",
            "Resend: verificar el dominio del remitente en la cuenta del proveedor.",
            "Inalambria: confirmar saldo, permisos y habilitación de SMS para Colombia.",
            "Enviar pruebas controladas a destinatarios autorizados antes de habilitar producción.",
            "Chatbot: se mantiene deshabilitado en producción hasta una decisión de despliegue y validación.",
        ],
    };
}
