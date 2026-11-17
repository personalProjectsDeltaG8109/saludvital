const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

function parseRequestUrl(value) {
    if (typeof value !== "string" || !value.trim()) return null;

    try {
        const parsed = new URL(value);
        return HTTP_PROTOCOLS.has(parsed.protocol) ? parsed : null;
    } catch {
        return null;
    }
}

function matchesRequestOrigin(request, candidate) {
    const parsed = parseRequestUrl(candidate);
    const requestHost = request.get("host");

    if (!parsed || !requestHost) return false;

    return parsed.host === requestHost;
}

export function isSameOriginRequest(request) {
    const fetchSite = request.get("sec-fetch-site")?.toLowerCase();
    if (fetchSite === "cross-site" || fetchSite === "same-site") return false;

    const origin = request.get("origin");
    if (origin) return matchesRequestOrigin(request, origin);

    const referer = request.get("referer");
    if (referer) return matchesRequestOrigin(request, referer);

    // Non-browser clients may omit both headers. SameSite=Lax remains active
    // on the authentication cookie, so preserve those clients' compatibility.
    return true;
}

function hasAuthenticationCookie(request) {
    return typeof request.cookies?.token === "string" && request.cookies.token.length > 0;
}

function isJsonRequest(request) {
    if (request.path.startsWith("/api/")) return true;

    const accept = request.get("accept")?.toLowerCase() || "";
    return accept.includes("application/json") && !accept.includes("text/html");
}

/**
 * Reject cross-origin state changes when the browser supplies an auth cookie.
 * Public authentication and provider webhook requests do not depend on that
 * cookie and therefore remain compatible with their existing clients.
 */
export function verifySameOrigin(request, response, next) {
    if (!STATE_CHANGING_METHODS.has(request.method) || !hasAuthenticationCookie(request)) {
        return next();
    }

    if (isSameOriginRequest(request)) return next();

    response.set("Cache-Control", "no-store");
    if (isJsonRequest(request)) {
        return response.status(403).json({ error: "Solicitud no autorizada." });
    }

    return response.status(403).send("Solicitud no autorizada.");
}

