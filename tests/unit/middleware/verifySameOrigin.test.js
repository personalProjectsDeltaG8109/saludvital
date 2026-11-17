import { describe, expect, jest, test } from "@jest/globals";
import { verifySameOrigin, isSameOriginRequest } from "../../../src/middleware/verifySameOrigin.js";

function createRequest({ method = "POST", host = "127.0.0.1", headers = {}, cookies = {} } = {}) {
    return {
        method,
        path: "/api/example",
        cookies,
        get(name) {
            return headers[name.toLowerCase()] ?? (name === "host" ? host : undefined);
        },
        accepts() {
            return "json";
        },
    };
}

function createResponse() {
    return {
        set: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
    };
}

describe("verifySameOrigin", () => {
    test.each([
        ["same-origin Origin", { origin: "http://127.0.0.1" }],
        ["same-origin Referer", { referer: "http://127.0.0.1/patient/profile" }],
        ["no browser origin headers", {}],
    ])("allows %s", (_label, headers) => {
        const request = createRequest({ headers, cookies: { token: "session-token" } });

        expect(isSameOriginRequest(request)).toBe(true);
    });

    test.each([
        ["a cross-origin Origin", { origin: "https://evil.example" }],
        ["a cross-origin Referer", { referer: "https://evil.example/form" }],
        ["a cross-site fetch metadata value", { "sec-fetch-site": "cross-site" }],
        ["a malformed Origin", { origin: "not-an-origin" }],
        ["a null Origin", { origin: "null" }],
    ])("rejects %s", (_label, headers) => {
        const request = createRequest({ headers, cookies: { token: "session-token" } });
        const response = createResponse();
        const next = jest.fn();

        verifySameOrigin(request, response, next);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(403);
        expect(response.json).toHaveBeenCalledWith({ error: "Solicitud no autorizada." });
    });

    test("gives Origin precedence over a same-origin Referer", () => {
        const request = createRequest({
            headers: {
                origin: "https://evil.example",
                referer: "http://127.0.0.1/patient/profile",
            },
            cookies: { token: "session-token" },
        });
        const response = createResponse();

        verifySameOrigin(request, response, jest.fn());

        expect(response.status).toHaveBeenCalledWith(403);
    });

    test.each([
        ["a GET request", { method: "GET" }],
        ["a request without an auth cookie", { cookies: {} }],
    ])("skips protection for %s", (_label, options) => {
        const request = createRequest(options);
        const response = createResponse();
        const next = jest.fn();

        verifySameOrigin(request, response, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(response.status).not.toHaveBeenCalled();
    });
});
