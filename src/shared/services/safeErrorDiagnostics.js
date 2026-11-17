const SAFE_DIAGNOSTIC_CATEGORIES = new Set([
    "configuration_error",
    "delivery_outcome_unknown",
    "invalid_request",
    "provider_rejected",
    "provider_temporary_failure",
    "unexpected_error",
]);

function getHttpStatus(error) {
    const status = Number(error?.httpStatus ?? error?.statusCode ?? error?.status);
    return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

function inferDiagnosticCategory(error, httpStatus) {
    if (SAFE_DIAGNOSTIC_CATEGORIES.has(error?.diagnosticCategory)) {
        return error.diagnosticCategory;
    }

    if (error?.deliveryOutcome === "unknown") return "delivery_outcome_unknown";
    if (
        error?.retryable === true ||
        httpStatus === 408 ||
        httpStatus === 429 ||
        httpStatus >= 500
    ) {
        return "provider_temporary_failure";
    }
    if (error?.deliveryOutcome === "rejected" || (httpStatus >= 400 && httpStatus < 500)) {
        return "provider_rejected";
    }

    return "unexpected_error";
}

// Expose only fixed categories and validated HTTP status numbers.
export function getSafeErrorDiagnostics(error) {
    const httpStatus = getHttpStatus(error);
    return {
        category: inferDiagnosticCategory(error, httpStatus),
        httpStatus,
    };
}

export function serializeSafeErrorDiagnostic(error) {
    const { category, httpStatus } = getSafeErrorDiagnostics(error);
    return httpStatus ? `${category}:http_${httpStatus}` : category;
}
