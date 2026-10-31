function validationError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

export function normalizeProfileText(value, label, maxLength, required = false) {
    if (value === undefined || value === null || typeof value !== "string") {
        if (required) throw validationError(`${label} es obligatorio.`);
        return null;
    }

    const normalized = value.trim();
    if ((required && !normalized) || normalized.length > maxLength) {
        throw validationError(`${label} no es válido.`);
    }
    return normalized || null;
}

export function normalizeProfileEmail(value) {
    const email = normalizeProfileText(value, "El correo electrónico", 320, true)?.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw validationError("Ingresa un correo electrónico válido.");
    }
    return email;
}

export function normalizeProfilePhone(value, label, required = false) {
    const phone = normalizeProfileText(value, label, 20, required);
    if (phone && !/^\+?[0-9]{7,15}$/.test(phone)) {
        throw validationError(`Ingresa un número válido para ${label.toLowerCase()}.`);
    }
    return phone;
}
