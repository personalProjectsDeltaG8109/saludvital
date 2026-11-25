const PROVIDER_STATUS_LABELS = {
    WhatsApp: {
        sent: "Aceptado por Meta",
        delivered: "Entregado por Meta",
        read: "Leído por Meta",
        failed: "Fallido según Meta",
    },
    SMS: {
        delivered: "Entregado por Inalambria",
        failed: "Fallido según Inalambria",
    },
};

const CONFIRMED_DELIVERY_STATUSES = {
    WhatsApp: new Set(["delivered", "read"]),
    SMS: new Set(["delivered"]),
};

export function getProviderStatusLabel(channel, status) {
    return PROVIDER_STATUS_LABELS[channel]?.[status] || null;
}

export function getProviderName(channel) {
    return { WhatsApp: "Meta", SMS: "Inalambria" }[channel] || null;
}

export function isConfirmedProviderDelivery(channel, status) {
    return CONFIRMED_DELIVERY_STATUSES[channel]?.has(status) || false;
}

export function isConfirmedProviderFailure(channel, status) {
    return status === "failed" && Boolean(getProviderStatusLabel(channel, status));
}
