# H-03 — Prevent Private Pages from Reappearing After Sign-Out

**Issue:** [#474](https://github.com/personalProjectsDeltaG8109/saludvital/issues/474)  
**Branch:** `fix/474-private-response-cache`  
**Status:** Implemented and verified; [PR #475](https://github.com/personalProjectsDeltaG8109/saludvital/pull/475) is open for review.

## Problem

Some private responses set `Cache-Control: no-store` individually, while the shared authentication middleware did not apply that rule to every protected route. Public files are served before the protected route modules and must remain unaffected.

## Change

- The shared `authenticateToken` middleware now marks protected responses as `no-store` before checking the session. This covers authenticated pages, APIs, redirects, and access-denied responses that use the middleware.
- The public static-file middleware is unchanged, so stylesheets and other public files keep their existing cache behavior.
- Added unit and HTTP checks for the shared rule and a static stylesheet, plus a Playwright browser-back check for patient, doctor, and administrator pages.
- No database or schema changes were needed.

## Verification

- `npm.cmd run format` — passed.
- Requested targeted Prettier write command — passed.
- `npm.cmd run format:check` — passed.
- `npm.cmd run lint` — passed.
- Full Jest suite — 149 suites and 1,148 tests passed.
- `npm.cmd run css:build` — passed; the existing local `public/css/app.css` was restored byte-for-byte afterward.
- `npm.cmd run test:e2e` — passed, including Playwright and axe-core checks. The new browser-back check passed for all three roles.
- `git diff --check` — passed.

## Notes

The Playwright back-navigation check uses a local test server that models an ended session. The real application's shared cache header is covered by unit and authenticated HTTP integration tests. The local, ignored `checklist.md` is updated as work proceeds and is not included in this change.
