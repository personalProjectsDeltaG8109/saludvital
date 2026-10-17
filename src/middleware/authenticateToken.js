import jwt from "jsonwebtoken";
import environment from "../../config/environment.js";
import { Rol, User } from "../models/associations.js";

import { isSessionExpired, refreshSession } from "../modules/auth/services/sessionActivity.js";

// Clear the authentication cookie using the same security settings.
function clearAuthenticationCookie(res) {
    res.clearCookie("token", {
        httpOnly: true,
        secure: environment.nodeEnv === "production",
        sameSite: "lax",
        path: "/",
    });
}

// Validate the JWT and verify that the account is still active.

export async function authenticateToken(req, res, next) {
    const token = req.cookies?.token;

    if (!token) {
        return res.redirect(303, "/login");
    }

    let payload;

    try {
        // Accept only tokens signed with the configured HS256 algorithm.
        payload = jwt.verify(token, environment.jwt.secret, {
            algorithms: ["HS256"],
        });
    } catch {
        // Remove expired or invalid tokens before requesting sign-in.
        clearAuthenticationCookie(res);
        return res.redirect(303, "/login");
    }

    // Reject malformed identity claims before checking the session identifier.
    if (
        typeof payload.sub !== "string" ||
        !payload.sub ||
        typeof payload.role !== "string" ||
        !payload.role
    ) {
        clearAuthenticationCookie(res);
        return res.status(401).send("Invalid authentication token.");
    }

    // Redirect tokens without a session identifier to the login page.
    if (typeof payload.sid !== "string" || !payload.sid) {
        clearAuthenticationCookie(res);
        return res.redirect(303, "/login");
    }

    // Reject sessions that have exceeded the inactivity limit.
    if (isSessionExpired(payload.sid)) {
        clearAuthenticationCookie(res);
        return res.redirect(303, "/login");
    }

    try {
        // Load the current account and role instead of trusting stale token data.
        const user = await User.findByPk(payload.sub, {
            where: { is_active: true },
            attributes: ["id", "is_active"],
            include: [
                {
                    model: Rol,
                    as: "rol",
                    attributes: ["id", "name"],
                    required: true,
                },
            ],
        });

        // Reject deleted, inactive, or unassigned accounts.
        if (!user || !user.is_active || !user.rol) {
            clearAuthenticationCookie(res);
            return res.redirect(303, "/login");
        }

        // Invalidate sessions whose role no longer matches the database.
        if (user.rol.name !== payload.role) {
            clearAuthenticationCookie(res);
            return res.redirect(303, "/login");
        }

        // Refresh activity only for an existing, authenticated session.
        if (!refreshSession(payload.sid)) {
            clearAuthenticationCookie(res);
            return res.redirect(303, "/login");
        }

        // Attach the verified identity and session identifier to the request.
        req.auth = {
            userId: String(user.id),
            role: user.rol.name,
            sessionId: payload.sid,
        };

        return next();
    } catch (error) {
        // Forward database failures instead of treating them as invalid tokens.
        return next(error);
    }
}

// Restrict access to users with an explicitly permitted database role.
export function requireRole(...allowedRoles) {
    return function roleAuthorization(req, res, next) {
        if (!req.auth || !allowedRoles.includes(req.auth.role)) {
            return res.status(403).send("Access denied.");
        }

        return next();
    };
}
