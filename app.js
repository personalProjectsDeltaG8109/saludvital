import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import authRoutes from "./src/modules/auth/routes/authRoutes.js";
import cookieParser from "cookie-parser";
import adminRoutes from "./src/modules/admin/routes/adminRoutes.js";
import doctorRoutes from "./src/modules/doctor/routes/doctorRoutes.js";
import patientRoutes from "./src/modules/patient/routes/patientRoutes.js";
import { errorHandler } from "./src/middleware/errorHandler.js";
import { authenticateTokenOptional } from "./src/middleware/authenticateToken.js";
import locationRoutes from "./src/modules/auth/routes/locationRoutes.js";
import whatsappWebhookRoutes from "./src/modules/patient/routes/whatsappWebhookRoutes.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

const app = express();

app.set("view engine", "pug");
app.set("views", path.join(currentDirectory, "views"));

app.use(helmet());
app.use(express.urlencoded({ extended: false }));
app.use(
    express.json({
        limit: "3mb",
        verify(req, res, buffer) {
            if (req.path === "/api/whatsapp/webhook") req.rawBody = Buffer.from(buffer);
        },
    }),
);
app.use(cookieParser());
app.use(express.static(path.join(currentDirectory, "public")));
app.use(whatsappWebhookRoutes);
// Register location lookup endpoints and application routes.
app.use(locationRoutes);
// Register authentication and role-specific routes.
app.use(authRoutes);
app.use(adminRoutes);
app.use(doctorRoutes);
app.use(patientRoutes);

// Redirect the application root to the login page.
app.get("/", (req, res) => {
    res.redirect(303, "/login");
});

// Preserve the verified role for personalized recovery links on the 404 page.
app.use(authenticateTokenOptional);
app.use((req, res) => {
    const homeByRole = {
        Patient: "/patient/dashboard",
        Doctor: "/doctor/dashboard",
        Administrator: "/admin/dashboard",
    };
    const appointmentsByRole = {
        Patient: "/patient/appointments",
        Doctor: "/doctor/appointments",
    };
    const role = req.auth?.role;
    const supportHref =
        "https://wa.me/573137498332?text=Hola%2C%20quisiera%20recibir%20informaci%C3%B3n%20sobre%20SaludVital.";

    return res.status(404).render("errors/404", {
        pageTitle: "Página no encontrada | SaludVital",
        homeHref: homeByRole[role] || "/login",
        appointmentsHref: role ? appointmentsByRole[role] || null : "/patient/appointments",
        supportHref,
    });
});

// Handle unexpected errors after normal routes and the not-found page.
app.use(errorHandler);

export default app;
