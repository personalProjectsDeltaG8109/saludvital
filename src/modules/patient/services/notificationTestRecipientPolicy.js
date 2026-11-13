function normalizeRecipient(recipient) {
    return typeof recipient === "string" ? recipient.trim().toLowerCase() : "";
}

export function getTestRecipientAllowlist(environment = process.env) {
    return new Set(
        String(environment.NOTIFICATION_TEST_RECIPIENTS || "")
            .split(",")
            .map(normalizeRecipient)
            .filter(Boolean),
    );
}

export function isTestRecipientAllowed(recipient, environment = process.env) {
    const normalizedRecipient = normalizeRecipient(recipient);
    return (
        normalizedRecipient !== "" &&
        getTestRecipientAllowlist(environment).has(normalizedRecipient)
    );
}
