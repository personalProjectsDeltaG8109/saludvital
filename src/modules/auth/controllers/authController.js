
import jwt from "jsonwebtoken";
import environment from "../../../../config/environment.js";
import {
    authenticateUser,
    AuthenticationError,
} from "../services/authService.js";

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
        pageTitle: "Sign in | SaludVital",
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
                pageTitle: "Sign in | SaludVital",
                error: "Your account does not have an authorized dashboard.",
            });
        }

        // Sign a token containing only the identity and database-assigned role.
        const token = jwt.sign(
            {
                sub: String(user.id),
                role: user.role,
            },
            environment.jwt.secret,
            {
                expiresIn: environment.jwt.expiresIn,
                algorithm: "HS256",
            },
        );

        // Store the token in a cookie that client-side JavaScript cannot read.
        res.cookie("token", token, getAuthCookieOptions());

        // Redirect the user to the dashboard assigned to their database role.
        return res.redirect(303, dashboard);
    } catch (error) {
        // Display a generic message for invalid credentials.
        if (error instanceof AuthenticationError) {
            return res.status(401).render("auth/login", {
                pageTitle: "Sign in | SaludVital",
                error: "Invalid email or password.",
            });
        }

        // Forward unexpected errors to centralized error handling.
        return next(error);
    }
}

// Clear the authentication cookie when the user signs out.
export function logout(req, res) {
    res.clearCookie("token", getAuthCookieOptions());
    return res.redirect(303, "/login");
}
