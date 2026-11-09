function getResponseStatus(error) {
    const status = error?.status ?? error?.statusCode;
    return Number.isInteger(status) && status >= 400 && status < 500 ? status : 500;
}

function getSafeMessage(status) {
    if (status === 413) return "La solicitud es demasiado grande.";
    if (status === 500) return "Ocurrió un error inesperado. Inténtalo de nuevo.";
    return "La solicitud no es válida.";
}

// Return safe request and server errors without exposing internal details.
export function errorHandler(error, req, res, next) {
    // Delegate errors when the response has already started.
    if (res.headersSent) {
        return next(error);
    }

    const status = getResponseStatus(error);
    const isApiRequest = req.path === "/api" || req.path?.startsWith("/api/");

    // Parser errors can include submitted text, so log only controlled categories.
    console.error("Application request failed.", {
        method: req.method,
        scope: isApiRequest ? "api" : "page",
        status,
        category: status === 500 ? "UNEXPECTED_ERROR" : "INVALID_REQUEST",
    });

    res.set("Cache-Control", "no-store");
    if (isApiRequest) {
        return res.status(status).json({ error: getSafeMessage(status) });
    }

    // Retry only safe GET destinations; never repeat a failed form submission.
    const requestUrl = req.originalUrl;
    const canRetryRequest =
        req.method === "GET" &&
        typeof requestUrl === "string" &&
        requestUrl.startsWith("/") &&
        !requestUrl.startsWith("//") &&
        !requestUrl.includes("\\") &&
        !Array.from(requestUrl).some((character) => {
            const code = character.charCodeAt(0);
            return code < 32 || code === 127;
        });

    // Return a generic, uncached page instead of exposing the internal error.
    return res.status(status).render("errors/500", {
        pageTitle: `${status === 500 ? "Error del servidor" : "Solicitud no válida"} | SaludVital`,
        errorCode: status,
        errorHeading: status === 500 ? "Error del servidor" : "Solicitud no válida",
        errorDescription: status === 500 ? null : getSafeMessage(status),
        errorHelp: status === 500 ? null : "Revisa la solicitud e inténtalo de nuevo.",
        retryHref: canRetryRequest ? requestUrl : "/login",
        retryLabel: canRetryRequest ? "Intentar de nuevo" : "Volver a iniciar sesión",
    });
}
