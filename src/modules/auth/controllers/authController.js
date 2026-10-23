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

import { requestPasswordReset, resetPassword } from "../services/passwordResetService.js";

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

/**
 * Render the login page with an optional error message.
 */
export function showLogin(req, res) {
    // Accept only a single string query parameter for the error message.
    const error = typeof req.query.error === "string" ? req.query.error : null;

    return res.status(200).render("auth/login", {
        pageTitle: "Iniciar sesión | SaludVital",
        error,
    });
}

/**
 * Render the patient registration page with an optional error message.
 */
export function showRegister(req, res) {
    const error = typeof req.query.error === "string" ? req.query.error : null;

    return res.status(200).render("auth/register", {
        pageTitle: "Registro de paciente | SaludVital",
        error,
        success: null,
    });
}

/**
 * Render the password recovery request page.
 */
function getRecoveryReturnDestination(source) {
    // Allow only the two destinations supported by the recovery entry points.
    return source === "profile"
        ? { href: "/patient/profile", label: "Volver a mi perfil" }
        : { href: "/login", label: "Volver a iniciar sesión" };
}

export function showForgotPassword(req, res) {
    const source = req.query.source === "profile" ? "profile" : "login";

    return res.status(200).render("auth/forgot-password", {
        pageTitle: "Recuperar contraseña | SaludVital",
        error: null,
        success: null,
        source,
        returnDestination: getRecoveryReturnDestination(source),
    });
}

/**
 * Queue a password recovery email without revealing account existence.
 */
export async function forgotPassword(req, res, next) {
    try {
        const source = req.body?.source === "profile" ? "profile" : "login";
        await requestPasswordReset(req.body?.email);

        // Always show the same message to prevent account enumeration.
        return res.status(200).render("auth/forgot-password", {
            pageTitle: "Recuperar contraseña | SaludVital",
            error: null,
            success:
                "Si existe una cuenta asociada a ese correo, recibirás instrucciones para recuperar tu contraseña.",
            source,
            returnDestination: getRecoveryReturnDestination(source),
        });
    } catch (error) {
        return next(error);
    }
}

/**
 * Render the password reset form with the supplied token.
 */
export function showResetPassword(req, res) {
    const token = typeof req.query.token === "string" ? req.query.token : "";

    // Prevent recovery tokens from leaking through referrer headers or cached pages.
    res.set({
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "no-store",
    });

    return res.status(200).render("auth/reset-password", {
        pageTitle: "Restablecer contraseña | SaludVital",
        token,
        error: null,
        success: null,
    });
}

/**
 * Validate the reset token and save the new password.
 */
export async function resetPasswordController(req, res, next) {
    try {
        // Prevent recovery tokens from leaking through referrer headers or cached pages.
        res.set({
            "Referrer-Policy": "no-referrer",
            "Cache-Control": "no-store",
        });

        const { token, password, password_confirmation: confirmation } = req.body ?? {};

        const result = await resetPassword(token, password, confirmation);

        if (!result.reset) {
            const messages = {
                invalid: "El enlace de recuperación no es válido o ha vencido.",
                invalid_or_expired: "El enlace de recuperación no es válido o ha vencido.",
                invalid_password:
                    "La contraseña debe tener al menos 10 caracteres e incluir una mayúscula, tres minúsculas, un número y un carácter especial. Ambas contraseñas deben coincidir.",
            };

            return res.status(400).render("auth/reset-password", {
                pageTitle: "Restablecer contraseña | SaludVital",
                token: typeof token === "string" ? token : "",
                error: messages[result.reason] || messages.invalid_or_expired,
                success: null,
            });
        }

        // Clear the browser token after the reset service revokes active sessions.
        res.clearCookie("token", {
            httpOnly: true,
            secure: environment.nodeEnv === "production",
            sameSite: "lax",
            path: "/",
        });

        return res.status(200).render("auth/reset-password", {
            pageTitle: "Contraseña actualizada | SaludVital",
            token: "",
            error: null,
            success:
                "Tu contraseña fue actualizada y cerramos tu sesión por seguridad. Inicia sesión con tu nueva contraseña.",
        });
    } catch (error) {
        return next(error);
    }
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
                error: "Tu cuenta no tiene un panel autorizado.",
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

        // Associate the authenticated session with its account for future revocation.
        startSession(sessionId, user.id);

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
