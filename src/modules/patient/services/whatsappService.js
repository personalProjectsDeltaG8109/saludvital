const GRAPH_API_BASE_URL = "https://graph.facebook.com";

const TEMPLATE_CONFIGURATION = {
    appointment_reminder: {
        nameKey: "META_WHATSAPP_REMINDER_TEMPLATE_NAME",
    },
    appointment_reschedule: {
        nameKey: "META_WHATSAPP_RESCHEDULE_TEMPLATE_NAME",
    },
    appointment_cancellation: {
        nameKey: "META_WHATSAPP_CANCELLATION_TEMPLATE_NAME",
    },
};

function serviceError(message, retryable = false) {
    const error = new Error(message);
    error.retryable = retryable;
    return error;
}

function getMetaConfiguration() {
    const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN?.trim();
    const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim();
    const apiVersion = process.env.META_WHATSAPP_API_VERSION?.trim();

    if (!accessToken || !phoneNumberId || !apiVersion) {
        throw serviceError("La integración de WhatsApp Cloud API no está configurada.");
    }
    if (!/^v\d+\.\d+$/.test(apiVersion)) {
        throw serviceError("La versión de WhatsApp Cloud API no es válida.");
    }

    return { accessToken, phoneNumberId, apiVersion };
}

function normalizeRecipient(value) {
    const recipient = typeof value === "string" ? value.trim().replace(/^whatsapp:/, "") : "";
    if (!/^\+[1-9]\d{7,14}$/.test(recipient)) {
        throw serviceError("El destinatario de WhatsApp no tiene un formato internacional válido.");
    }
    return recipient.slice(1);
}

function getTemplate(eventType) {
    const templateConfiguration = TEMPLATE_CONFIGURATION[eventType];
    const templateName =
        templateConfiguration && process.env[templateConfiguration.nameKey]?.trim();
    const language = process.env.META_WHATSAPP_TEMPLATE_LANGUAGE?.trim();

    if (!templateConfiguration || !templateName || !language) {
        throw serviceError("La plantilla aprobada de WhatsApp no está configurada.");
    }

    return { templateConfiguration, templateName, language };
}

function buildTemplateParameters(inputVariables) {
    const variables = Array.isArray(inputVariables) ? inputVariables : [];
    if (variables.some((value) => typeof value !== "string" || !value.trim())) {
        throw serviceError("Las variables de la plantilla de WhatsApp no son válidas.");
    }
    return variables.map((value) => ({ type: "text", text: value.trim() }));
}

function isRetryableStatus(status, result) {
    if (typeof result?.error?.is_transient === "boolean") return result.error.is_transient;
    return status === 408 || status === 429 || status >= 500;
}

async function sendMetaRequest({ accessToken, phoneNumberId, apiVersion, recipient, template }) {
    const response = await fetch(`${GRAPH_API_BASE_URL}/${apiVersion}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: recipient,
            type: "template",
            template,
        }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw serviceError(
            `Meta WhatsApp rechazó el mensaje (HTTP ${response.status}).`,
            isRetryableStatus(response.status, result),
        );
    }

    return { id: result.messages?.[0]?.id || null, status: "accepted" };
}

async function sendMetaPayload({ accessToken, phoneNumberId, apiVersion, recipient, payload }) {
    const response = await fetch(`${GRAPH_API_BASE_URL}/${apiVersion}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: recipient,
            ...payload,
        }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw serviceError(
            `Meta WhatsApp rechazó la respuesta (HTTP ${response.status}).`,
            isRetryableStatus(response.status, result),
        );
    }
    return { id: result.messages?.[0]?.id || null, status: "accepted" };
}

export async function sendWhatsApp({ to, eventType, contentVariables }) {
    const recipient = normalizeRecipient(to);
    const { accessToken, phoneNumberId, apiVersion } = getMetaConfiguration();
    const { templateName, language } = getTemplate(eventType);
    const parameters = buildTemplateParameters(contentVariables);
    const template = {
        name: templateName,
        language: { code: language },
        ...(parameters.length ? { components: [{ type: "body", parameters }] } : {}),
    };

    return sendMetaRequest({
        accessToken,
        phoneNumberId,
        apiVersion,
        recipient,
        template,
    });
}

export async function sendWhatsAppReply({ to, text, options = [] }) {
    const recipient = normalizeRecipient(to);
    const { accessToken, phoneNumberId, apiVersion } = getMetaConfiguration();
    const messageText = typeof text === "string" ? text.trim() : "";
    if (!messageText || messageText.length > 1024) {
        throw serviceError("La respuesta del chatbot no tiene un texto válido.");
    }

    const validOptions = Array.isArray(options)
        ? options.filter(
              (option) =>
                  option &&
                  /^[A-Za-z0-9:_-]{1,200}$/.test(option.id) &&
                  typeof option.title === "string" &&
                  option.title.trim().length > 0 &&
                  option.title.trim().length <= 24,
          )
        : [];
    const interactive = validOptions.length
        ? {
              type: "interactive",
              interactive: {
                  type: "list",
                  body: { text: messageText },
                  action: {
                      button: "Ver opciones",
                      sections: [
                          {
                              title: "SaludVital",
                              rows: validOptions.slice(0, 10).map((option) => ({
                                  id: option.id,
                                  title: option.title.trim(),
                                  ...(option.description
                                      ? { description: String(option.description).slice(0, 72) }
                                      : {}),
                              })),
                          },
                      ],
                  },
              },
          }
        : { type: "text", text: { body: messageText } };

    return sendMetaPayload({
        accessToken,
        phoneNumberId,
        apiVersion,
        recipient,
        payload: interactive,
    });
}
