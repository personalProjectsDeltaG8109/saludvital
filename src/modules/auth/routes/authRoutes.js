import { Router } from "express";
import rateLimit from "express-rate-limit";
import { login, logout, showLogin, showRegister, register } from "../controllers/authController.js";

import { authenticateToken } from "../../../middleware/authenticateToken.js";

import { verifyEmailAddress } from "../controllers/authController.js";

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

// Register the authentication endpoints.
const authRoutes = Router();

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
