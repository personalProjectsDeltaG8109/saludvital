const DEFAULT_CONTACT_MESSAGE = "Hola, quisiera recibir información sobre SaludVital.";

/** Return a public WhatsApp link only when an approved contact is configured. */
export function getConfiguredWhatsAppContactUrl() {
    const contactNumber = process.env.LOGIN_WHATSAPP_CONTACT_NUMBER?.replace(/\D/g, "") || "";

    if (!/^[1-9]\d{7,14}$/.test(contactNumber)) {
        return null;
    }

    return `https://wa.me/${contactNumber}?text=${encodeURIComponent(DEFAULT_CONTACT_MESSAGE)}`;
}
