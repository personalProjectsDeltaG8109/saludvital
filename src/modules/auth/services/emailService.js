function getResendConfiguration() {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
    const fromName = process.env.RESEND_FROM_NAME?.trim();

    if (!apiKey || !fromEmail) {
        throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL must be configured.");
    }

    return {
        apiKey,
        from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    };
}

async function sendResendEmail({ to, subject, text, html }) {
    const { apiKey, from } = getResendConfiguration();
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ from, to: [to], subject, text, html }),
    });

    if (!response.ok) {
        throw new Error(`Resend rejected the email (HTTP ${response.status}).`);
    }
}

// Send the account verification link to the registered email address.
export async function sendVerificationEmail(
    email,
    verificationUrl,
    { isEmailChange = false } = {},
) {
    const safeVerificationUrl = verificationUrl
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");

    const subject = isEmailChange
        ? "Confirma tu nuevo correo de SaludVital"
        : "Confirma tu cuenta de SaludVital";
    const title = isEmailChange ? "Confirma tu nuevo correo" : "¡Confirma tu cuenta!";
    const description = isEmailChange
        ? "Recibimos una solicitud para cambiar el correo de tu cuenta. Confirma esta dirección para aplicar el cambio. Tu correo actual seguirá activo hasta entonces."
        : "Gracias por registrarte en SaludVital. Para activar tu cuenta y comenzar a disfrutar de nuestros servicios, haz clic en el siguiente botón:";
    const actionLabel = isEmailChange ? "Confirmar nuevo correo" : "Confirmar cuenta";
    const textContent = isEmailChange
        ? [
              "Hola:",
              "",
              "Recibimos una solicitud para cambiar el correo de tu cuenta de SaludVital.",
              "Confirma esta dirección para aplicar el cambio. Tu correo actual seguirá activo hasta entonces:",
              verificationUrl,
              "",
              "Por seguridad, el enlace tiene una vigencia limitada.",
              "Si no solicitaste este cambio, puedes ignorar este mensaje.",
          ].join("\n")
        : [
              "Hola:",
              "",
              "Gracias por registrarte en SaludVital.",
              "Para confirmar tu cuenta y comenzar a usar SaludVital, abre este enlace:",
              verificationUrl,
              "",
              "Por seguridad, el enlace tiene una vigencia limitada.",
              "Si no creaste esta cuenta, puedes ignorar este mensaje.",
          ].join("\n");

    await sendResendEmail({
        to: email,
        subject,
        text: textContent,
        html: `
            <!doctype html>
            <html lang="es">
                <body style="margin:0;padding:24px 12px;background:#f1f8fc;font-family:Arial,Helvetica,sans-serif;color:#123b73;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;">
                        <tr><td style="padding:28px 32px 12px;text-align:center;">
                            <img src="${(process.env.APP_BASE_URL || "").replace(/\/$/, "")}/brand/logo-symbol.png" width="64" height="64" alt="SaludVital" style="display:block;margin:0 auto 18px;object-fit:contain;">
                            <h1 style="margin:0 0 10px;color:#0756a5;font-size:30px;line-height:1.2;">${title}</h1>
                            <p style="margin:0 auto 22px;max-width:460px;color:#496487;font-size:16px;line-height:1.55;">${description}</p>
                            <a href="${safeVerificationUrl}" style="display:inline-block;min-width:250px;padding:14px 24px;border-radius:12px;background:#08b66f;color:#ffffff;text-align:center;text-decoration:none;font-size:17px;font-weight:bold;">✓ &nbsp; ${actionLabel} &nbsp; →</a>
                        </td></tr>
                        <tr><td style="padding:22px 32px 18px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
                                <td width="33%" style="padding:8px;text-align:center;border-right:1px solid #dceaf4;color:#087cf0;font-size:14px;font-weight:bold;">▦<br><span style="color:#0756a5;font-size:12px;">Agenda<br>tus citas</span></td>
                                <td width="34%" style="padding:8px;text-align:center;border-right:1px solid #dceaf4;color:#087cf0;font-size:14px;font-weight:bold;">♧<br><span style="color:#0756a5;font-size:12px;">Recibe<br>notificaciones</span></td>
                                <td width="33%" style="padding:8px;text-align:center;color:#087cf0;font-size:14px;font-weight:bold;">♡<br><span style="color:#0756a5;font-size:12px;">Gestiona tu<br>historial médico</span></td>
                            </tr></table>
                        </td></tr>
                        <tr><td style="padding:0 28px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8f6fd;border-radius:12px;"><tr><td style="padding:14px 18px;color:#315b7c;font-size:13px;line-height:1.5;"><strong style="color:#0756a5;">ℹ &nbsp; Este enlace tiene una vigencia limitada.</strong><br>${isEmailChange ? "Si no solicitaste este cambio, puedes ignorar este correo. Tu dirección actual no cambiará." : "Si no creaste esta cuenta, puedes ignorar este correo."}</td></tr></table></td></tr>
                        <tr><td style="padding:2px 24px 26px;text-align:center;"><p style="margin:0 0 14px;color:#0756a5;font-size:18px;font-weight:bold;">El equipo de SaludVital</p><div style="height:3px;max-width:360px;margin:0 auto;background:linear-gradient(90deg,#b9e8ff,#00c98b,#b9e8ff);"></div></td></tr>
                    </table>
                </body>
            </html>
        `,
    });
}

/**
 * Send a password recovery link to the account email address.
 */
export async function sendPasswordResetEmail(email, resetUrl) {
    await sendResendEmail({
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
