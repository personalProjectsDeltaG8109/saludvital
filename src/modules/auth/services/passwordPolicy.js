const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 50;
const MAX_BCRYPT_INPUT_BYTES = 72;

export function isPasswordWithinSupportedLength(password) {
    return (
        typeof password === "string" &&
        password.length <= MAX_PASSWORD_LENGTH &&
        Buffer.byteLength(password, "utf8") <= MAX_BCRYPT_INPUT_BYTES
    );
}

export function isValidPassword(password) {
    if (
        typeof password !== "string" ||
        password.length < MIN_PASSWORD_LENGTH ||
        !isPasswordWithinSupportedLength(password)
    ) {
        return false;
    }

    return (
        /[A-Z]/.test(password) &&
        (password.match(/[a-z]/g) || []).length >= 3 &&
        /\d/.test(password) &&
        /[^A-Za-z0-9]/.test(password)
    );
}
