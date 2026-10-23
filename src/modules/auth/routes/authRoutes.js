import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
    login,
    logout,
    showLogin,
    showRegister,
    register,
    showForgotPassword,
    forgotPassword,
    showResetPassword,
    resetPasswordController,
    verifyEmailAddress,
} from "../controllers/authController.js";

import { authenticateToken } from "../../../middleware/authenticateToken.js";

// Limit repeated login attempts to reduce password-guessing attacks.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,

    // Redirect users to the login page with an error message.
    handler: (req, res) => {
        return res.redirect(
            "/login?error=" +
                encodeURIComponent(
                    "Demasiados intentos de inicio de sesión. Por favor, inténtalo de nuevo más tarde.",
                ),
        );
    },
});

// Limit repeated registration attempts to reduce automated abuse.
const registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,

    // Redirect users to the registration page with an error message.
    handler: (req, res) => {
        return res.redirect(
            "/register?error=" +
                encodeURIComponent("Demasiados intentos de registro. Inténtalo más tarde."),
        );
    },
});

/**
 * Limit password recovery requests to reduce abuse.
 */
const passwordRecoveryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        // Render the page that matches the recovery endpoint being limited.
        const isResetRequest = req.path === "/reset-password";

        if (isResetRequest) {
            // Protect reset tokens in rate-limit responses.
            res.set({
                "Referrer-Policy": "no-referrer",
                "Cache-Control": "no-store",
            });

            return res.status(429).render("auth/reset-password", {
                pageTitle: "Restablecer contraseña | SaludVital",
                token: typeof req.body?.token === "string" ? req.body.token : "",
                error: "Demasiadas solicitudes. Inténtalo de nuevo más tarde.",
                success: null,
            });
        }

        return res.status(429).render("auth/forgot-password", {
            pageTitle: "Recuperar contraseña | SaludVital",
            error: "Demasiadas solicitudes. Inténtalo de nuevo más tarde.",
            success: null,
            source: req.body?.source === "profile" ? "profile" : "login",
            returnDestination:
                req.body?.source === "profile"
                    ? { href: "/patient/profile", label: "Volver a mi perfil" }
                    : { href: "/login", label: "Volver a iniciar sesión" },
        });
    },
});

// Register the authentication endpoints.
const authRoutes = Router();

/* Password recovery pages and actions. */
authRoutes.get("/forgot-password", showForgotPassword);
authRoutes.post("/forgot-password", passwordRecoveryLimiter, forgotPassword);
authRoutes.get("/reset-password", showResetPassword);
authRoutes.post("/reset-password", passwordRecoveryLimiter, resetPasswordController);
authRoutes.get("/login", showLogin);
// Display the patient registration form.
authRoutes.get("/register", showRegister);
// Process patient registration.
authRoutes.post("/register", registerLimiter, register);
authRoutes.post("/login", loginLimiter, login);
authRoutes.post("/logout", logout);
// Confirm an email address using its verification token.
authRoutes.get("/verify-email", verifyEmailAddress);
// Refresh the authenticated session when the browser reports activity.
authRoutes.post("/session/activity", authenticateToken, (req, res) => {
    return res.sendStatus(204);
});

export default authRoutes;
