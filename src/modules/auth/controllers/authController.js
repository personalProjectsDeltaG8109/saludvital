import jwt from "jsonwebtoken";
import environment from "../../../../config/environment.js";
import {
    authenticateUser,
    AuthenticationError,
    EmailVerificationRequiredError,
} from "../services/authService.js";

import { randomUUID } from "node:crypto";
import { startSession, endSession } from "../services/sessionActivity.js";

import { verifyEmail } from "../services/emailVerificationService.js";

// Verify a patient's email address using the supplied token.
export async function verifyEmailAddress(req, res, next) {
    try {
        const token = typeof req.query.token === "string" ? req.query.token : "";

        const result = await verifyEmail(token);

        if (!result.verified) {
            return res.status(400).render("auth/email-verification-result", {
                verified: false,
            });
        }

        return res.status(200).render("auth/email-verification-result", {
            verified: true,
        });
    } catch (error) {
        return next(error);
    }
}

// Convert the configured JWT lifetime into cookie milliseconds.
function getJwtLifetimeMs() {
    const lifetime = environment.jwt.expiresIn;

    // Numeric JWT lifetimes are expressed in seconds.
    if (typeof lifetime === "number" && Number.isFinite(lifetime) && lifetime > 0) {
        return lifetime * 1000;
    }

    // Support explicit second, minute, hour, and day units.
    const match = /^(\d+)(s|m|h|d)$/.exec(String(lifetime));

    if (!match) {
        throw new Error("JWT_EXPIRES_IN must use seconds, minutes, hours, or days.");
    }

    const amount = Number(match[1]);
    const unitMs = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
    };

    if (amount <= 0) {
        throw new Error("JWT_EXPIRES_IN must be greater than zero.");
    }

    return amount * unitMs[match[2]];
}

// Define the cookie settings used to protect the authentication token.
function getAuthCookieOptions() {
    return {
        httpOnly: true,
        secure: environment.nodeEnv === "production",
        sameSite: "lax",
        path: "/",
        maxAge: getJwtLifetimeMs(),
    };
}

// Map database roles to their corresponding dashboard routes.
const dashboardRoutes = {
    Patient: "/patient/dashboard",
    Doctor: "/doctor/dashboard",
    Administrator: "/admin/dashboard",
};

// Render the login page.
export function showLogin(req, res) {
    // Avoid displaying the login form when a valid session already exists.
    res.status(200).render("auth/login", {
        pageTitle: "Inicio de sesión | SaludVital",
        error: null,
    });
}

// Authenticate the submitted credentials and establish the JWT cookie.
export async function login(req, res, next) {
    try {
        const { email, password } = req.body;

        // Authenticate the account using the existing authentication service.
        const user = await authenticateUser(email, password);

        // Only allow roles that have an explicitly configured dashboard.
        const dashboard = dashboardRoutes[user.role];

        if (!dashboard) {
            return res.status(403).render("auth/login", {
                pageTitle: "Inicio de sesión | SaludVital",
                error: "Your account does not have an authorized dashboard.",
            });
        }

        // Generate a unique identifier for this authenticated session.
        const sessionId = randomUUID();

        // Sign a token with the user identity, role, and session identifier.
        const token = jwt.sign(
            {
                sub: String(user.id),
                role: user.role,
                sid: sessionId,
            },
            environment.jwt.secret,
            {
                expiresIn: environment.jwt.expiresIn,
                algorithm: "HS256",
            },
        );

        // Start tracking inactivity before issuing the cookie.
        startSession(sessionId);

        // Store the token in an HTTP-only authentication cookie.
        res.cookie("token", token, getAuthCookieOptions());

        // Redirect the user to the dashboard assigned to their role.
        return res.redirect(303, dashboard);
    } catch (error) {
        // Show a clear message when the email has not been verified.
        if (error instanceof EmailVerificationRequiredError) {
            return res.status(403).render("auth/login", {
                pageTitle: "Inicio de sesión | SaludVital",
                error: "Debes confirmar tu correo electrónico antes de iniciar sesión.",
            });
        }

        // Display a generic message for invalid credentials.
        if (error instanceof AuthenticationError) {
            return res.status(401).render("auth/login", {
                pageTitle: "Inicio de Sesion | SaludVital",
                error: "Invalido el email o contraseña.",
            });
        }

        // Forward unexpected errors to centralized error handling.
        return next(error);
    }
}

// End the server-side session and clear the authentication cookie.
export function logout(req, res) {
    const sessionId = req.auth?.sessionId;

    if (sessionId) {
        endSession(sessionId);
    }

    res.clearCookie("token", {
        httpOnly: true,
        secure: environment.nodeEnv === "production",
        sameSite: "lax",
        path: "/",
    });

    return res.redirect(303, "/login");
}
