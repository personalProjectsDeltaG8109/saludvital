export function getSafeDeliveryError(error) {
    if (!error) return null;
    const message = String(error).toLowerCase();
    const code = String(error).match(/\b(?:code|error|http)\s*[:=]?\s*(\d{3,6})\b/i)?.[1] || null;
    let description =
        "El proveedor no pudo completar el envío. Verifica la configuración de la integración.";

    if (/template/.test(message)) {
        description = "La plantilla de WhatsApp no está configurada o no es válida.";
    } else if (/meta whatsapp delivery failed/.test(message)) {
        description = "Meta informó que no pudo entregar el mensaje.";
    } else if (/sender|from number|phone_number_id|not configured/.test(message)) {
        description = "La configuración del remitente de WhatsApp está incompleta.";
    } else if (/recipient|destination|international format/.test(message)) {
        description = "El número de destino no tiene un formato válido.";
    } else if (/timeout|temporar|unavailable|\b5\d\d\b/.test(message)) {
        description = "El proveedor de mensajería no está disponible temporalmente.";
    }

    return { description, code };
}
