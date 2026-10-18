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

// Handle patient registration and its expected validation errors.
import { registerPatient, RegistrationError } from "../services/registrationService.js";

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

// Render the login page with an optional error message.
export function showLogin(req, res) {
    return res.render("auth/login", {
        error: typeof req.query.error === "string" ? req.query.error : null,
    });
}

// Render the patient registration page.
export function showRegister(req, res) {
    return res.status(200).render("auth/register", {
        pageTitle: "Registro de paciente | SaludVital",
        error: null,
        success: null,
    });
}

// Validate consent and create a patient account.
export async function register(req, res, next) {
    try {
        // Require explicit consent before processing health information.
        if (req.body?.health_data_consent !== "accepted") {
            return res.status(400).render("auth/register", {
                pageTitle: "Registro de paciente | SaludVital",
                error: "Debes autorizar el tratamiento de datos personales y de salud para registrarte.",
                success: null,
            });
        }

        // Map the form field to the name expected by the registration service.
        const registrationData = {
            ...req.body,
            existing_conditions: req.body.medical_conditions,
        };

        // The service validates the data and creates the account transactionally.
        const patient = await registerPatient(registrationData);

        // Confirm registration without automatically signing the patient in.
        return res.status(201).render("auth/register", {
            pageTitle: "Registro completado | SaludVital",
            error: null,
            success: `Tu cuenta fue creada. Revisa el correo ${patient.email} para verificar tu dirección antes de iniciar sesión.`,
        });
    } catch (error) {
        // Show expected validation errors without exposing internal details.
        if (error instanceof RegistrationError) {
            return res.status(error.statusCode).render("auth/register", {
                pageTitle: "Registro de paciente | SaludVital",
                error:
                    error.statusCode >= 500
                        ? "No fue posible completar el registro. Inténtalo más tarde."
                        : error.message,
                success: null,
            });
        }

        // Let centralized error handling process unexpected failures.
        return next(error);
    }
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
