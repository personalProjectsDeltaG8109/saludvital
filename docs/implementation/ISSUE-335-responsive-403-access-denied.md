# ISSUE-335 — Responsive Access-Denied Page

## Scope

Implement the supplied 403 reference using the original medical illustration, a dark background, and a rounded white recovery panel. Desktop actions sit side by side; mobile actions stack with full-width targets. The supplied 1605 × 980 PNG is preserved unchanged.

## Authorization and Recovery

- `requireRole` still rejects unauthorized identities with HTTP 403 and never calls the protected handler.
- HTML navigation renders `views/errors/403.pug` with a dedicated stylesheet and `Cache-Control: no-store`.
- `/api/` requests and non-HTML clients retain the existing plain-text denial response.
- Home recovery uses the existing `/` route.
- Dashboard recovery uses an explicit allowlist of existing destinations for Patient, Doctor, and Administrator, based only on `req.auth.role` established upstream by authentication.
- Missing or unrecognized identities have no dashboard action. Query parameters cannot override the role or redirect destination.
- Existing authentication, session validation, and login verification flows are unchanged.

## Verification

- Focused Jest tests: 3 suites passed, 104 tests passed (`accessDenied.http`, `authenticateToken`, and application HTTP routes).
- Targeted ESLint and Prettier checks passed.
- Chrome/Playwright review at 1440 × 900, 1280 × 720, 1280 × 600, 768 × 1024, 390 × 844, and 320 × 740.
- HTTP 403, image loading, no horizontal overflow, recovery destinations, keyboard focus, and no-JavaScript navigation verified.
- axe-core reported no violations at all six reviewed sizes; these automated checks do not establish full accessibility conformance.
- The image served by the browser matched the supplied file's SHA-256 digest.
- Preview used an isolated harness with synthetic identities and the real role middleware; no preview routes or authentication shortcuts were added to the application and no real database records were changed.

## Screenshots

### Desktop

![Desktop access-denied page](assets/ISSUE-335-403-desktop.png)

### Mobile

![Mobile access-denied page](assets/ISSUE-335-403-mobile.png)

## Publication

Keep the branch and commits local until the project owner explicitly authorizes pushing and opening a pull request.
