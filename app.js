import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import authRoutes from "./src/modules/auth/routes/authRoutes.js";
import cookieParser from "cookie-parser";

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

// Register the authentication routes.
app.use(authRoutes);

app.get("/", (req, res) => {
    res.status(200).render("layouts/main", {
        pageTitle: "SaludVital | Your health, connected",
    });
});

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        application: "SaludVital",
    });
});

export default app;
