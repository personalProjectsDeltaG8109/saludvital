import { Router } from "express";
import {
    processMetaWhatsAppWebhook,
    verifyMetaWebhookChallenge,
    verifyMetaWebhookSignature,
} from "../services/whatsappWebhookService.js";

const whatsappWebhookRoutes = Router();

whatsappWebhookRoutes.get("/api/whatsapp/webhook", (req, res) => {
    const challenge = verifyMetaWebhookChallenge(req.query);
    if (challenge === null) return res.sendStatus(403);
    return res.status(200).type("text/plain").send(challenge);
});

whatsappWebhookRoutes.post("/api/whatsapp/webhook", async (req, res) => {
    const appSecret = process.env.META_WHATSAPP_APP_SECRET?.trim();
    const signature = req.get("x-hub-signature-256");
    if (!verifyMetaWebhookSignature(req.rawBody, signature, appSecret)) {
        return res.sendStatus(401);
    }
    try {
        await processMetaWhatsAppWebhook(req.body);
        return res.sendStatus(200);
    } catch (error) {
        console.error("Meta WhatsApp webhook processing failed.", {
            errorName: error?.name || "Error",
        });
        return res.sendStatus(500);
    }
});

export default whatsappWebhookRoutes;
