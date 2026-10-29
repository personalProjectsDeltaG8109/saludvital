const INALAMBRIA_SEND_URL = "https://api.inalambria.express/v1/messages/send";

function serviceError(message, retryable = false) {
    const error = new Error(message);
    error.retryable = retryable;
    return error;
}

function validateSms(to, body) {
    const recipient = typeof to === "string" ? to.trim() : "";
    const message = typeof body === "string" ? body.trim() : "";

    if (!/^\+57\d{10}$/.test(recipient)) {
        throw serviceError("El destinatario debe ser un número celular válido de Colombia.");
    }
    if (!message || message.length > 1600) {
        throw serviceError("El mensaje SMS debe tener entre 1 y 1600 caracteres.");
    }
    return { recipient, message };
}

function getApiKey() {
    const apiKey = process.env.INALAMBRIA_API_KEY?.trim();
    if (!apiKey) throw serviceError("La integración de SMS no está configurada.");
    return apiKey;
}

function isRetryableStatus(status) {
    return status === 408 || status === 429 || status >= 500;
}

const RETRYABLE_INALAMBRIA_CODES = new Set([
    "BILLING_VALIDATION_ERROR",
    "FRAUD_VALIDATION_ERROR",
    "INTERNAL_ERROR",
    "MESSAGE_SCHEDULING_FAILED",
    "MESSAGE_SEND_FAILED",
    "PARTIAL_SEND",
    "PRICING_CALCULATION_FAILED",
    "RATE_LIMIT_EXCEEDED",
]);

const PERMANENT_INALAMBRIA_CODES = new Set([
    "ACCOUNT_BANNED",
    "API_KEY_EXPIRED",
    "API_KEY_INACTIVE",
    "API_KEY_INVALID",
    "API_KEY_IP_BLOCKED",
    "API_KEY_REVOKED",
    "API_KEY_USER_BANNED",
    "BILLING_VALIDATION_FAILED",
    "BUDGET_EXCEEDED",
    "CONFIGURATION_ERROR",
    "COUNTRY_MISMATCH",
    "FRAUD_DETECTED",
    "INVALID_AUTHORIZATION",
    "INVALID_PHONE_NUMBER",
    "MISSING_AUTHORIZATION",
    "PERMISSION_DENIED",
    "ROUTE_NOT_FOUND",
    "VALIDATION_ERROR",
    "WALLET_NOT_FOUND",
]);

function isRetryableInalambriaError(result, status) {
    const errorCode = result?.data?.errorCode || result?.errorCode;
    if (RETRYABLE_INALAMBRIA_CODES.has(errorCode)) return true;
    if (PERMANENT_INALAMBRIA_CODES.has(errorCode)) return false;
    return isRetryableStatus(status);
}

export async function sendSms({ to, body }) {
    const { recipient, message } = validateSms(to, body);
    const apiKey = getApiKey();
    const response = await fetch(INALAMBRIA_SEND_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ recipients: [recipient], content: message, async: true }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw serviceError(
            `Inalambria Express rechazó el SMS (HTTP ${response.status}).`,
            isRetryableInalambriaError(result, response.status),
        );
    }

    return {
        id:
            result.jobId ||
            result.job_id ||
            result.consumptionId ||
            result.messages?.[0]?.id ||
            null,
        status: "accepted",
    };
}
