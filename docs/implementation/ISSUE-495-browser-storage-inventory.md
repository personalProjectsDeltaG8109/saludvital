# Issue #495 — Review Cookies and Browser Storage

## Result

SaludVital uses one necessary authentication cookie named `token` to keep a signed-in user connected. The cookie is marked `HttpOnly`, uses `SameSite=Lax`, is sent with `Secure` in production, and expires according to the configured login-token lifetime. Logging out removes it. The token itself is not available to browser JavaScript.

The source review found no use of `localStorage`, `sessionStorage`, IndexedDB, analytics tags, or embedded third-party widgets. The clean-browser check covered the login page and the Patient, Doctor, and Administrator dashboards. It found no optional browser storage and no automatic third-party page requests on those pages. Provider requests are made by server-side services; the WhatsApp support link is opened only when a user selects it.

The privacy notice now explains the authentication cookie. No cookie-consent banner was added because the reviewed application does not use optional tracking cookies. The browser check does not cover scripts that a hosting platform could inject outside this repository; repeat the check if those are added.

## Code Changes

- Added `tests/e2e/browser-storage.e2e.js` to check cookie settings, browser storage, page requests, and logout for all three roles using only `saludvital_test`.
- Added the check to `npm run test:e2e`.
- Updated the security section and version date in `views/legal/partials/privacy-policy-content.pug`.
- Marked H-10 complete in `checklist.md`.

No database, dependency, or provider changes were needed.

## Verification

- `node tests/e2e/browser-storage.e2e.js` — passed for Patient, Doctor, and Administrator.
- `npm.cmd test -- --runInBand` — passed: 153 suites and 1,178 tests.
- `npm.cmd run lint` — passed.
- `npx.cmd prettier --write` on the changed files and `npm.cmd run format:check` — passed.
- `npm.cmd run css:build` — passed.
- `npm.cmd run test:e2e` — passed, including browser, responsive, and axe-core checks.
- `git diff --check` — passed.
