import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import {
    InvalidInalambriaSmsCallbackError,
    processInalambriaSmsDeliveryStatus,
} from "../services/inalambriaSmsDeliveryStatusService.js";

const inalambriaSmsWebhookRoutes = Router();

function safeStringEqual(actual, expected) {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return (
        actualBuffer.length === expectedBuffer.length &&
        timingSafeEqual(actualBuffer, expectedBuffer)
    );
}

function getBasicCredentials(authorizationHeader) {
    const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorizationHeader || "");
    if (!match) return null;

    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 1) return null;

    return {
        username: decoded.slice(0, separatorIndex),
        password: decoded.slice(separatorIndex + 1),
    };
}

function isAuthorizedProviderCallback(authorizationHeader) {
    const expectedUsername = process.env.INALAMBRIA_REST_USERNAME?.trim();
    const expectedPassword = process.env.INALAMBRIA_REST_PASSWORD?.trim();
    if (!expectedUsername || !expectedPassword) return false;

    const receivedCredentials = getBasicCredentials(authorizationHeader);
    if (!receivedCredentials) return false;

    return (
        safeStringEqual(receivedCredentials.username, expectedUsername) &&
        safeStringEqual(receivedCredentials.password, expectedPassword)
    );
}

inalambriaSmsWebhookRoutes.post("/api/inalambria/sms/status", async (req, res) => {
    if (!isAuthorizedProviderCallback(req.get("authorization"))) return res.sendStatus(401);

    try {
        const result = await processInalambriaSmsDeliveryStatus(req.body);
        if (result.status === "not_found") return res.sendStatus(503);
        return res.sendStatus(200);
    } catch (error) {
        if (error instanceof InvalidInalambriaSmsCallbackError) return res.sendStatus(400);

        console.error("Inalambria SMS status callback processing failed.", {
            errorName: error?.name || "Error",
        });
        return res.sendStatus(503);
    }
});

export default inalambriaSmsWebhookRoutes;
