import { isIP } from "node:net";
import { ipKeyGenerator } from "express-rate-limit";

/**
 * Use Railway's edge-provided address only on requests marked by that edge.
 * Local and unrecognized requests continue to use Express's socket-derived IP.
 */
export function getAuthRateLimitKey(request) {
    const isRailwayPublicRequest =
        Boolean(process.env.RAILWAY_PUBLIC_DOMAIN) && Boolean(request.get("x-railway-edge"));
    const railwayClientIp = request.get("x-real-ip")?.trim();

    if (isRailwayPublicRequest && isIP(railwayClientIp)) {
        return ipKeyGenerator(railwayClientIp);
    }

    const socketClientIp = request.ip || request.socket.remoteAddress || "unknown";
    return ipKeyGenerator(socketClientIp);
}
