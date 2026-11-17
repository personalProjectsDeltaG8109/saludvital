# H-07 — Authenticated State-Changing Request Origin Checks

## Scope

The application authenticates browser users with an HTTP-only `token` cookie. Before this change, the cookie used `SameSite=Lax`, but the application did not explicitly validate the origin of state-changing requests.

## Implementation

- Added `verifySameOrigin` as application middleware immediately after `cookieParser`.
- The middleware checks `POST`, `PUT`, `PATCH`, and `DELETE` requests only when an authentication cookie is present.
- When the browser sends `Origin`, it must match the request host. If `Origin` is absent, a supplied `Referer` must match the request host.
- Browser Fetch Metadata values `cross-site` and `same-site` are rejected as cross-origin signals before the fallback header checks.
- Malformed, `null`, or cross-origin values return HTTP 403 without invoking route authentication or business logic.
- JSON/API requests receive a Spanish JSON error; browser form requests receive the same safe Spanish denial as plain text. Both responses are marked `no-store`.
- Requests without `Origin` and `Referer` continue for compatibility with non-browser clients. The authentication cookie keeps its existing `SameSite=Lax` setting.

## Endpoint boundaries

The middleware is registered before static files and all application routers, so protected patient, doctor, administrator, logout, and session-activity mutations share one policy. Public login, registration, password recovery, and reset actions do not require an authenticated cookie and remain unchanged. WhatsApp and Inalambria provider callbacks use their own provider authentication/signature checks and do not depend on the user cookie, so they remain unchanged as well.

The email-verification link is a tokenized `GET` without an authenticated session cookie. It is outside this cookie-based CSRF boundary; state-changing behavior should continue to use a tokenized, single-purpose link rather than a browser session.

## Output safety

The new denial message is a fixed Spanish string. No request headers, cookies, submitted form values, tokens, or provider data are reflected in the response. Existing Pug escaping and browser-side `textContent` behavior remain unchanged.

## Verification

- Unit tests cover same-origin `Origin`, same-origin `Referer`, absent browser headers, cross-origin and malformed values, `null` origin, cross-site Fetch Metadata, origin precedence, safe skips for `GET` and requests without an auth cookie.
- Supertest coverage covers a cross-origin API mutation, a cross-origin browser form mutation, a same-origin request continuing to normal authentication, and public registration remaining outside the authenticated-cookie check.
- Focused unit suite: 10 tests passed.
- Targeted Prettier and ESLint checks passed.
- The HTTP integration suite could not bind Supertest's local ephemeral ports in the restricted execution environment (`EACCES 127.0.0.1:<port>`). The existing `tests/integration/app.test.js` reproduces the same environment failure before route assertions run.

## Limitations

This is an origin-boundary check, not a synchronizer-token implementation. Requests from non-browser clients that omit both `Origin` and `Referer` remain compatible by design. If the deployment later accepts browser mutations from multiple approved origins, those origins must be explicitly modeled instead of weakening the host comparison.

