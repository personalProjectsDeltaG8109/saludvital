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

    // Return a generic page instead of exposing the internal error.
    return res.status(500).render("errors/500", {
        pageTitle: "Error del servidor | SaludVital",
    });
}
