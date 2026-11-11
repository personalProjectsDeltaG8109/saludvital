export function showPrivacyPolicy(req, res) {
    return renderLegalPage(res, {
        pageTitle: "Política de Privacidad | SaludVital",
        pageHeading: "Política de privacidad",
        pageEyebrow: "Tu información, explicada con claridad",
        pageDescription:
            "Conoce qué información se usa en la plataforma, para qué sirve y cómo cuidar tus datos.",
        brandMessage:
            "Te contamos cómo se usan los datos de demostración y cuáles son tus opciones como usuario.",
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
        brandMessage:
            "Consulta de manera sencilla qué puedes hacer en SaludVital y cómo participar en sus pruebas.",
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
            "Encuentra respuestas básicas para ingresar y probar las funciones de SaludVital.",
        brandMessage:
            "Encuentra indicaciones rápidas para navegar el aplicativo y aprovechar tu cuenta de demostración.",
        activeLegalPage: "help",
        view: "legal/help",
    });
}

function renderLegalPage(res, { view, ...pageData }) {
    return res.render(view, pageData);
}
