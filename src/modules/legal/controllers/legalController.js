export function showPrivacyPolicy(req, res) {
    return renderLegalPage(res, {
        pageTitle: "Política de Privacidad | SaludVital",
        pageHeading: "Política de privacidad",
        pageEyebrow: "Tu información, explicada con claridad",
        pageDescription:
            "Conoce qué información se usa en la plataforma, para qué sirve y cómo cuidar tus datos.",
        pageMeta: "Versión 1.2 · 17 de noviembre de 2026",
        activeLegalPage: "privacy",
        view: "legal/privacy-policy",
    });
}

export function showTermsAndConditions(req, res) {
    return renderLegalPage(res, {
        pageTitle: "Términos y condiciones | SaludVital",
        pageHeading: "Términos y condiciones",
        pageEyebrow: "Reglas simples para la demostración",
        pageDescription:
            "Revisa las condiciones básicas para usar SaludVital durante las actividades académicas.",
        pageMeta: "Versión 1.2 · Actualizada el 18 de noviembre de 2026",
        activeLegalPage: "terms",
        view: "legal/terms-and-conditions",
    });
}

export function showHelp(req, res) {
    return renderLegalPage(res, {
        pageTitle: "Ayuda | SaludVital",
        pageHeading: "Centro de ayuda",
        pageEyebrow: "Estamos para orientarte",
        pageDescription:
            "Aprende cómo verificar tu cuenta, recuperar el acceso y usar las funciones de demostración.",
        pageMeta: "Guía para usar la demostración de SaludVital",
        activeLegalPage: "help",
        view: "legal/help",
    });
}

function renderLegalPage(res, { view, ...pageData }) {
    return res.render(view, pageData);
}
