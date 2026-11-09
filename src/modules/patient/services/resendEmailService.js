const RESEND_SEND_URL = "https://api.resend.com/emails";

const EVENT_SUBJECTS = {
    appointment_confirmation: "Confirmación de tu cita en SaludVital",
    appointment_reminder: "Recordatorio de tu cita en SaludVital",
    appointment_reschedule: "Actualización de tu cita en SaludVital",
    appointment_cancellation: "Cancelación de tu cita en SaludVital",
};

function serviceError(message, retryable = false, deliveryOutcome = "rejected") {
    const error = new Error(message);
    error.retryable = retryable;
    error.deliveryOutcome = deliveryOutcome;
    return error;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        };
        return entities[character];
    });
}

function getConfiguration() {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const fromAddress = process.env.RESEND_FROM_EMAIL?.trim();
    const fromName = process.env.RESEND_FROM_NAME?.trim();
    if (!apiKey || !fromAddress) {
        throw serviceError("La integración de correo no está configurada.");
    }
    return {
        apiKey,
        from: fromName ? `${fromName} <${fromAddress}>` : fromAddress,
    };
}

function isRetryableStatus(status) {
    return status === 429;
}

function isAmbiguousStatus(status) {
    return status === 408 || status >= 500;
}

export async function sendResendEmail({ to, eventType, body, idempotencyKey }) {
    const recipient = typeof to === "string" ? to.trim() : "";
    const message = typeof body === "string" ? body.trim() : "";
    const defaultSubject = EVENT_SUBJECTS[eventType];
    if (!recipient || !defaultSubject || !message) {
        throw serviceError("La notificación de correo no tiene los datos requeridos.");
    }
    if (
        idempotencyKey !== undefined &&
        (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9._-]{1,256}$/.test(idempotencyKey))
    ) {
        throw serviceError("La referencia de idempotencia del correo no es válida.");
    }

    const { apiKey, from } = getConfiguration();
    const eventKey = {
        appointment_confirmation: "CONFIRMATION",
        appointment_reminder: "REMINDER",
        appointment_reschedule: "RESCHEDULE",
        appointment_cancellation: "CANCELLATION",
    }[eventType];
    const subject = process.env[`RESEND_${eventKey}_SUBJECT`]?.trim() || defaultSubject;
    const html =
        process.env[`RESEND_${eventKey}_HTML`]?.trim() ||
        `<p>${escapeHtml(message)}</p><p>SaludVital</p>`;

    let response;
    try {
        response = await fetch(RESEND_SEND_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
            },
            signal: AbortSignal.timeout(15_000),
            body: JSON.stringify({ from, to: [recipient], subject, html }),
        });
    } catch {
        throw serviceError("Resend no confirmó el resultado del correo.", false, "unknown");
    }
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw serviceError(
            `Resend rechazó el correo (HTTP ${response.status}).`,
            isRetryableStatus(response.status),
            isAmbiguousStatus(response.status) ? "unknown" : "rejected",
        );
    }

    return { id: result.id || null, status: "accepted" };
}

export async function sendWhatsAppIdentityCode({ to, code }) {
    const recipient = typeof to === "string" ? to.trim() : "";
    if (!recipient || !/^\d{6}$/.test(String(code))) {
        throw serviceError("No se pudo preparar la verificación de identidad.");
    }
    const { apiKey, from } = getConfiguration();
    const safeCode = escapeHtml(code);
    let response;
    try {
        response = await fetch(RESEND_SEND_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(15_000),
            body: JSON.stringify({
                from,
                to: [recipient],
                subject: "Código de seguridad de SaludVital",
                text: `Tu código de verificación es ${code}. Vence en 10 minutos. Si no solicitaste este código, ignora este mensaje.`,
                html: `<p>Tu código de verificación es <strong>${safeCode}</strong>.</p><p>Vence en 10 minutos. Si no solicitaste este código, ignora este mensaje.</p>`,
            }),
        });
    } catch {
        throw serviceError(
            "Resend no confirmó el resultado del código de seguridad.",
            false,
            "unknown",
        );
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw serviceError(
            `Resend no pudo enviar el código de seguridad (HTTP ${response.status}).`,
            isRetryableStatus(response.status),
            isAmbiguousStatus(response.status) ? "unknown" : "rejected",
        );
    }
    return { id: result.id || null, status: "accepted" };
}
