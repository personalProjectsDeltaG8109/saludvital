import nodemailer from "nodemailer";

// Configure the SMTP transport using environment variables.
function createTransport() {
    const host = process.env.EMAIL_HOST;
    const port = Number(process.env.EMAIL_PORT);
    const user = process.env.EMAIL_USER;
    const password = process.env.EMAIL_PASS;

    if (!host || ![465, 587].includes(port) || !user || !password) {
        throw new Error("Email SMTP configuration is incomplete.");
    }

    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
            user,
            pass: password,
        },
    });
}

// Send the account verification link to the registered email address.
export async function sendVerificationEmail(email, verificationUrl) {
    const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;

    if (!from) {
        throw new Error("EMAIL_FROM or EMAIL_USER must be configured.");
    }

    const transporter = createTransport();

    await transporter.sendMail({
        from,
        to: email,
        subject: "Confirma tu cuenta de SaludVital",
        text: [
            "Hola:",
            "",
            "Gracias por registrarte en SaludVital.",
            "Para confirmar tu correo electrónico, abre este enlace:",
            verificationUrl,
            "",
            "Si no creaste esta cuenta, puedes ignorar este mensaje.",
            "Por seguridad, el enlace tiene un tiempo de validez limitado.",
        ].join("\n"),
        html: `
            <main style="font-family: Arial, sans-serif; color: #123B73; line-height: 1.6;">
                <h1>Bienvenido a SaludVital</h1>
                <p>Gracias por crear tu cuenta.</p>
                <p>Confirma tu correo electrónico haciendo clic en el siguiente enlace:</p>
                <p>
                    <a href="${verificationUrl}"
                       style="display:inline-block;padding:12px 20px;background:#123B73;color:#ffffff;text-decoration:none;border-radius:24px;">
                        Confirmar mi cuenta
                    </a>
                </p>
                <p>Este enlace tiene un tiempo de validez limitado.</p>
                <p>Si no creaste esta cuenta, puedes ignorar este mensaje.</p>
            </main>
        `,
    });
}

/**
 * Send a password recovery link to the account email address.
 */
export async function sendPasswordResetEmail(email, resetUrl) {
    const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;

    if (!from) {
        throw new Error("EMAIL_FROM or EMAIL_USER must be configured.");
    }

    const transporter = createTransport();

    await transporter.sendMail({
        from,
        to: email,
        subject: "Recupera tu contraseña de SaludVital",
        text: [
            "Hola:",
            "",
            "Recibimos una solicitud para restablecer tu contraseña de SaludVital.",
            "Para crear una nueva contraseña, abre este enlace:",
            resetUrl,
            "",
            "Si no solicitaste este cambio, puedes ignorar este mensaje.",
            "Por seguridad, el enlace tiene un tiempo de validez limitado.",
        ].join("\n"),
        html: `
            <main style="font-family: Arial, sans-serif; color: #123B73; line-height: 1.6;">
                <h1>Recupera tu contraseña</h1>
                <p>Recibimos una solicitud para restablecer tu contraseña de SaludVital.</p>
                <p>Haz clic en el siguiente botón para crear una nueva contraseña:</p>
                <p>
                    <a href="${resetUrl}"
                       style="display:inline-block;padding:12px 20px;background:#123B73;color:#ffffff;text-decoration:none;border-radius:24px;">
                        Restablecer contraseña
                    </a>
                </p>
                <p>Este enlace tiene un tiempo de validez limitado.</p>
                <p>Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
            </main>
        `,
    });
}
