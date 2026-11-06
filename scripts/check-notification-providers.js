import "dotenv/config";
import { getNotificationProviderPreflight } from "../src/modules/admin/services/adminNotificationSettingsService.js";

const preflight = getNotificationProviderPreflight();
let isReady = preflight.deliveryEnabled;

console.log("Verificación local de proveedores de notificaciones");
console.log(`Procesamiento automático: ${preflight.deliveryEnabled ? "activado" : "desactivado"}`);
console.log(
    `Runtime del chatbot: ${preflight.chatbot.runtimeEnabled ? "habilitado" : "deshabilitado"}`,
);
if (preflight.chatbot.runtimeEnabled && !preflight.chatbot.identityVerificationReady) {
    isReady = false;
    console.log(
        `  Variable pendiente para verificar identidad: ${preflight.chatbot.missingVariables.join(", ")}`,
    );
}

for (const channel of preflight.channels) {
    const sendStatus = channel.sendReady ? "completo" : "incompleto";
    console.log(`\n${channel.provider}: envío ${sendStatus}`);

    if (!channel.sendReady) {
        isReady = false;
        console.log(`  Variables pendientes: ${channel.missingSendVariables.join(", ")}`);
    }

    if (channel.webhookReady !== null) {
        console.log(
            `  Webhook: ${channel.webhookReady ? "configuración local completa" : "configuración local incompleta"}`,
        );
        if (!channel.webhookReady) {
            isReady = false;
            console.log(`  Variables pendientes: ${channel.missingWebhookVariables.join(", ")}`);
        }
    }
}

console.log("\nComprobaciones externas pendientes de validar manualmente:");
for (const check of preflight.manualChecks) console.log(`- ${check}`);
console.log("\nEste comando no contacta proveedores ni envía mensajes.");

if (!isReady) {
    console.error("\nLa configuración local aún no está lista para procesar notificaciones.");
    process.exitCode = 1;
} else {
    console.log(
        "\nLa configuración local está completa; falta validar los requisitos externos listados.",
    );
}
