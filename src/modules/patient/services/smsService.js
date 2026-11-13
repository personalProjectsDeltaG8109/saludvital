const INALAMBRIA_SMS_URL = "https://rest.inalambria.com/mtmessage";
const MAX_SMS_LENGTH = 500;

function serviceError(message, retryable = false, deliveryOutcome = "rejected") {
    const error = new Error(message);
    error.retryable = retryable;
    error.deliveryOutcome = deliveryOutcome;
    return error;
}

function validateSms(to, body) {
    const recipient = typeof to === "string" ? to.trim() : "";
    const message = typeof body === "string" ? body.trim() : "";

    if (!/^\+57\d{10}$/.test(recipient)) {
        throw serviceError("El destinatario debe ser un número celular válido de Colombia.");
    }
    if (!message || message.length > MAX_SMS_LENGTH) {
        throw serviceError(`El mensaje SMS debe tener entre 1 y ${MAX_SMS_LENGTH} caracteres.`);
    }
    return { recipient, message };
}

function getCredentials() {
    const username = process.env.INALAMBRIA_REST_USERNAME?.trim();
    const password = process.env.INALAMBRIA_REST_PASSWORD?.trim();
    if (!username || !password) {
        throw serviceError("La integración de SMS no está configurada.");
    }
    return { username, password };
}

function getBasicAuthorization({ username, password }) {
    const credentials = Buffer.from(`${username}:${password}`).toString("base64");
    return `Basic ${credentials}`;
}

function isRetryableStatus(status) {
    return status === 408 || status === 429 || status >= 500;
}

function providerTransactionNumber(result) {
    const transactionNumber = String(result?.TransactionNumber || "");
    return /^\d{28}$/.test(transactionNumber) ? transactionNumber : null;
}

function providerAccepted(result) {
    return result?.Status === 0 || result?.Status === "0";
}

export async function sendSms({ to, body, notificationId }) {
    const { recipient, message } = validateSms(to, body);
    const credentials = getCredentials();
    const requestBody = {
        Type: 1,
        MessageText: message,
        Devices: recipient.slice(1),
    };

    // The provider returns this opaque reference in its delivery callback.
    if (Number.isSafeInteger(notificationId) && notificationId > 0) {
        requestBody.CustomMessageId = String(notificationId);
    }

    let response;
    try {
        response = await fetch(INALAMBRIA_SMS_URL, {
            method: "POST",
            headers: {
                Authorization: getBasicAuthorization(credentials),
                "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(15_000),
            body: JSON.stringify(requestBody),
        });
    } catch {
        throw serviceError("Inalambria no confirmó el resultado del SMS.", false, "unknown");
    }

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw serviceError(
            `Inalambria rechazó el SMS (HTTP ${response.status}).`,
            isRetryableStatus(response.status),
            response.status === 408 || response.status >= 500 ? "unknown" : "rejected",
        );
    }

    if (!providerAccepted(result)) {
        if (result?.Status === 1 || result?.Status === "1") {
            throw serviceError("Inalambria rechazó el SMS.");
        }
        throw serviceError("Inalambria no confirmó el resultado del SMS.", false, "unknown");
    }

    const transactionNumber = providerTransactionNumber(result);
    if (!transactionNumber) {
        // Without the documented transaction reference, delivery cannot be reconciled safely.
        throw serviceError(
            "Inalambria no devolvió una referencia válida para el SMS.",
            false,
            "unknown",
        );
    }

    return { id: transactionNumber, status: "accepted" };
}
