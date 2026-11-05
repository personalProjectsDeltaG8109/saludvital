import environment from "../../config/environment.js";

// Handle unexpected errors without exposing internal details to clients.
export function errorHandler(error, req, res, next) {
    // Delegate errors when the response has already started.
    if (res.headersSent) {
        return next(error);
    }

    // Log diagnostic details on the server without logging request secrets.
    console.error("Unhandled application error.", {
        method: req.method,
        path: req.path,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: environment.nodeEnv === "production" ? undefined : error?.stack,
    });

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
    res.set("Cache-Control", "no-store");
    return res.status(500).render("errors/500", {
        pageTitle: "Error del servidor | SaludVital",
        retryHref: canRetryRequest ? requestUrl : "/login",
        retryLabel: canRetryRequest ? "Intentar de nuevo" : "Volver a iniciar sesión",
    });
}
