# ISSUE-340 — Password Recovery Visual Flow

## Scope

- Redesigned the existing password recovery request, generic link-sent confirmation, and password reset screens to follow the supplied SaludVital references.
- Reused the approved login logo, background, doctor illustration, password visibility behavior, configured WhatsApp contact, and existing recovery routes.
- Matched the desktop brand panel's calendar, reminder, and health icons to the login panel. The desktop forgot-password card uses a standalone lock icon without the decorative lock backdrop.
- Added the supplied password-security illustration to the forgot-password and reset-password screens. The link-sent artwork slot remains reserved for an owner-provided illustration.
- Matched the desktop recovery page to the login background: the two wide side panels are transparent, while the recovery form remains in its white card. The WhatsApp appointment callout remains available when its contact destination is configured.
- Updated the desktop recovery copy to explain that patients can reset their password and continue managing appointments safely.
- Kept recovery tokens, anti-enumeration behavior, rate limits, password validation, and password persistence in the existing services.
- Added responsive viewport and accessibility coverage for the recovery request and reset screens.

## Data and Security

The confirmation remains generic and does not reveal whether an account exists. The WhatsApp CTA is rendered only when a valid contact number is configured. No schema or dependency changes are required.

## Verification

- `npm run format` — passed.
- The requested targeted Prettier write command for application, test, Pug, CSS, and CI files — passed.
- `npm test -- --runInBand` — passed: 119 suites and 939 tests.
- `npm run lint` — passed.
- `npm run format:check` — passed.
- `npm run css:build` — passed.
- Password recovery browser checks passed at 320, 375, 760, and 1440 px, including overflow and password visibility checks. Recovery axe-core checks passed at mobile and desktop sizes.
- `node tests/e2e/app.e2e.js` reached and passed the password recovery responsive and accessibility checks, then exited with an unrelated existing login-lock countdown assertion failure.
- Mobile and desktop screenshots were visually reviewed; the mobile logo and doctor illustration no longer overlap.

## Limitations

The link-sent state still uses its existing neutral illustration because a dedicated image for that state has not been supplied. No recovery business logic, database schema, or dependencies were changed.
