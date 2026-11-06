# Issue 346 — Login Splash Screen

## Implementation

- Added a short, decorative splash to the initial `GET /login` response. Failed-login and locked responses do not render it, so authentication messages and lockout guidance remain immediate.
- Reused the official local SaludVital login logo. CSS draws the ECG line, light rings, waves, particles, and indeterminate progress indicator in the existing brand palette; no animation dependency or external request was added.
- The script waits briefly for visible login images, tolerates image decode failures, holds the splash for approximately five seconds, shows a short completion message, and removes the overlay. Resource waiting is bounded so failed images cannot extend the display indefinitely.
- Without the splash script, a CSS fallback hides the overlay after five seconds. Reduced-motion users skip the animation. The overlay is decorative, `aria-hidden`, inert, and does not intercept pointer interaction or change the underlying login layout.
- The original login form, password controls, registration and recovery links, WhatsApp links, and authentication flow are unchanged.

## Verification

- `npm run format`: passed; repository files were already formatted apart from the new files.
- Targeted Prettier check: passed.
- `npm test -- --runInBand`: 120 suites and 955 tests passed.
- Focused auth view/controller tests: 2 suites and 12 tests passed.
- `npm run lint`: passed.
- `npm run format:check`: passed.
- `npm run css:build`: passed.
- `node tests/e2e/app.e2e.js`: passed, including splash visibility/dismissal, desktop and 320px mobile overflow, reduced motion, no-script fallback, failed decorative image, responsive login, and axe-core checks.
- Full `npm run test:e2e`: stopped at the existing `admin-appointment-edit.e2e.js` scenario waiting for “Ese horario ya no está disponible.” The preceding application/login E2E checks passed; this failure is outside the login splash change.

## Limitations

The progress indicator is intentionally indeterminate: it does not represent database, security, or provider health. A CSS-only fallback dismisses after a fixed interval because no JavaScript readiness signal is available in that mode.
