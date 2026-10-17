import { Router } from "express";
import rateLimit from "express-rate-limit";
import { login, logout, showLogin } from "../controllers/authController.js";

import { authenticateToken } from "../../../middleware/authenticateToken.js";

import { verifyEmailAddress } from "../controllers/authController.js";

// Limit repeated login attempts to reduce password-guessing attacks.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many login attempts. Please try again later.",
});

// Register the authentication endpoints.
const authRoutes = Router();

authRoutes.get("/login", showLogin);
authRoutes.post("/login", loginLimiter, login);
authRoutes.post("/logout", logout);
// Confirm an email address using its verification token.
authRoutes.get("/verify-email", verifyEmailAddress);
// Refresh the authenticated session when the browser reports activity.
authRoutes.post("/session/activity", authenticateToken, (req, res) => {
    return res.sendStatus(204);
});

export default authRoutes;
