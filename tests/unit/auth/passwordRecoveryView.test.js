import { fileURLToPath } from "node:url";
import { renderFile } from "pug";

const recoveryViewPath = fileURLToPath(
    new URL("../../../views/auth/forgot-password.pug", import.meta.url),
);
const resetViewPath = fileURLToPath(
    new URL("../../../views/auth/reset-password.pug", import.meta.url),
);
const loginViewPath = fileURLToPath(new URL("../../../views/auth/login.pug", import.meta.url));

const commonLocals = {
    pageTitle: "Recuperar contraseña | SaludVital",
    returnDestination: { href: "/login", label: "Volver al inicio de sesión" },
    source: "login",
    whatsappContactUrl: null,
};

describe("password recovery views", () => {
    test("includes the optional splash without changing the login form", () => {
        const html = renderFile(loginViewPath, {
            pageTitle: "Iniciar sesión | SaludVital",
            showLoginSplash: true,
            whatsappContactUrl: null,
            error: null,
            loginLockedUntil: null,
        });

        expect(html).toContain("data-login-splash");
        expect(html).toContain("/js/login-splash.js");
        expect(html).toContain("/brand/login/logo-login-mobile.png");
        expect(html).toContain('action="/login"');
    });

    test("omits the splash for login responses that do not opt in", () => {
        const html = renderFile(loginViewPath, {
            pageTitle: "Iniciar sesión | SaludVital",
            showLoginSplash: false,
            whatsappContactUrl: null,
            error: "Credenciales inválidas.",
            loginLockedUntil: null,
        });

        expect(html).not.toContain("data-login-splash");
        expect(html).not.toContain("/js/login-splash.js");
        expect(html).toContain("Credenciales inválidas.");
        expect(html).toContain('action="/login"');
    });

    test("renders the recovery request form and supplied security illustration", () => {
        const html = renderFile(recoveryViewPath, {
            ...commonLocals,
            error: null,
            success: null,
        });

        expect(html).toContain('data-image-slot="forgot-password"');
        expect(html).toContain("recovery-art-slot-lock");
        expect(html).toContain("/brand/login/password-security.png");
        expect(html).toContain(
            "Restablece tu contraseña y continúa gestionando tus citas médicas de forma segura y confiable.",
        );
        expect(html).toContain('action="/forgot-password"');
        expect(html).toContain('name="email"');
        expect(html).toContain("login-benefit-icon");
        expect(html).toContain("/brand/calendar-svgrepo-com.svg");
        expect(html).toContain("girl.png");
    });

    test("renders a generic sent-link state with the supplied confirmation illustration", () => {
        const html = renderFile(recoveryViewPath, {
            ...commonLocals,
            error: null,
            success:
                "Si el correo electrónico está asociado a una cuenta, enviaremos un enlace para restablecer la contraseña.",
        });

        expect(html).toContain('data-image-slot="recovery-link-sent"');
        expect(html).toContain("/brand/login/recovery-link-sent.png");
        expect(html).toContain("recovery-art-slot-plain");
        expect(html).toContain("Hemos enviado el enlace");
        expect(html).toContain("Si el correo electrónico está asociado a una cuenta");
        expect(html).not.toContain('action="/forgot-password"');
    });

    test("renders reset fields with the established password limits and guidance", () => {
        const html = renderFile(resetViewPath, {
            ...commonLocals,
            pageTitle: "Restablecer contraseña | SaludVital",
            token: "test-token",
            error: null,
            success: null,
        });

        expect(html).toContain('action="/reset-password"');
        expect(html).toContain('name="password"');
        expect(html).toContain('name="password_confirmation"');
        expect(html).toContain('maxlength="50"');
        expect(html).toContain("al menos tres minúsculas");
        expect(html).toContain('data-image-slot="reset-password"');
        expect(html).toContain("/brand/login/password-security.png");
        expect(html).toContain("recovery-art-slot-plain");
    });
});
