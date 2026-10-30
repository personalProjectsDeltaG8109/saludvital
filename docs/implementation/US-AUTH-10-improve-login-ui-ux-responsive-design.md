# US-AUTH-10 — Improve Login Page UI/UX and Responsive Design

## User story

As a SaludVital user, I want a clear, responsive sign-in page so that I can securely access my account from desktop and mobile devices.

## Acceptance criteria

1. The existing authentication flow, server-side validation, generic errors, rate limiting, role-based redirects, password recovery, registration, security middleware, and session expiration remain unchanged.
2. The login page follows the supplied SaludVital desktop and mobile references and uses the existing brand palette.
3. Desktop uses a two-column brand and sign-in layout; mobile uses a single-column layout with the form prioritized.
4. The supplied medical background and illustration are used as decorative assets and have no redundant screen-reader announcement.
5. Email and password fields retain their existing names, autocomplete values, validation, and POST destination.
6. A keyboard-accessible control lets users reveal and conceal their password.
7. Password recovery and registration links continue to navigate to their existing routes.
8. The page does not offer a “Remember me” control or extend session persistence.
9. A WhatsApp contact action is rendered only when `LOGIN_WHATSAPP_CONTACT_NUMBER` contains a valid international phone number; its destination is not hard-coded in the template.
10. Layout and controls remain usable at mobile, tablet, and desktop sizes without horizontal overflow.
11. Controls have accessible names, visible keyboard focus, and logical keyboard order.
12. Visible interface content is in Spanish; technical identifiers and comments are in English.
13. Existing authentication behavior and security protections are not weakened.

## Implementation notes

- Reused the existing `/login` route, Pug layout, CSS build pipeline, and authentication controller.
- Added the supplied background and doctor illustration under `public/brand/login/`.
- Added an optional public contact-number setting to `.env.example`. Invalid or missing values hide the WhatsApp contact action; provider credentials and Meta phone-number identifiers are not reused as a public contact number.
- Added an accessible password visibility toggle without changing password submission behavior.
- No database, dependency, authentication, or session changes were required.

## Verification

- `npm.cmd test -- --runInBand tests/unit/auth tests/integration/app.test.js` — passed: 10 suites, 194 tests.
- `node tests/e2e/app.e2e.js` — passed responsive checks at 320, 375, 768, 1024, and 1440 pixels, login password reveal, existing registration flow, and axe-core checks for login and registration.
- Targeted ESLint checks — passed for the changed JavaScript files.
- Targeted Prettier checks — passed for the changed source, Pug, test, and documentation files.
- `npm.cmd run css:build` — passed.
