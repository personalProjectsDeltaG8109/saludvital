import { normalizeProfileText } from "../../../shared/services/profileFieldValidationService.js";

function validationError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

export function normalizeProfileEmail(value) {
    const email = normalizeProfileText(value, "El correo electrónico", 320, true)?.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw validationError("Ingresa un correo electrónico válido.");
    }
    return email;
}
