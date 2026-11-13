import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "@jest/globals";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const blockedDestinationMessage = "El destinatario no está autorizado.";
const scripts = ["send-test-email.js", "send-test-sms.js", "send-test-whatsapp.js"];

describe("manual notification test scripts", () => {
    test.each(scripts)("rejects destinations outside the allowlist in %s", (scriptName) => {
        const environment = {
            PATH: process.env.PATH,
            SystemRoot: process.env.SystemRoot,
            NODE_ENV: "test",
            NOTIFICATION_DELIVERY_ENABLED: "false",
            NOTIFICATION_TEST_RECIPIENTS: "",
            RESEND_API_KEY: "",
            RESEND_FROM_EMAIL: "",
            INALAMBRIA_API_KEY: "",
            META_WHATSAPP_ACCESS_TOKEN: "",
            META_WHATSAPP_PHONE_NUMBER_ID: "",
            META_WHATSAPP_BUSINESS_ACCOUNT_ID: "",
            META_WHATSAPP_APP_SECRET: "",
        };
        const result = spawnSync(
            process.execPath,
            [path.join(repositoryRoot, "scripts", scriptName), "blocked@example.test"],
            { cwd: repositoryRoot, env: environment, encoding: "utf8" },
        );

        expect(result.status).toBe(1);
        expect(result.stderr).toContain(blockedDestinationMessage);
        expect(result.stdout + result.stderr).not.toContain("blocked@example.test");
    });
});
