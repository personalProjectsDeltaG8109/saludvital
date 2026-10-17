import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import authRoutes from "./src/modules/auth/routes/authRoutes.js";
import cookieParser from "cookie-parser";
import adminRoutes from "./src/modules/admin/routes/adminRoutes.js";
import doctorRoutes from "./src/modules/doctor/routes/doctorRoutes.js";
import patientRoutes from "./src/modules/patient/routes/patientRoutes.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

const app = express();

app.set("view engine", "pug");
app.set("views", path.join(currentDirectory, "views"));

app.use(helmet());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(currentDirectory, "public")));

// Register authentication and role-specific routes.
app.use(authRoutes);
app.use(adminRoutes);
app.use(doctorRoutes);
app.use(patientRoutes);

// Redirect the application root to the login page.
app.get("/", (req, res) => {
    res.redirect(303, "/login");
});

export default app;
