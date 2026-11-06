# Issue 346 — Login Splash Screen

## Implementation

- Added a short, decorative splash to the initial `GET /login` response. Failed-login and locked responses do not render it, so authentication messages and lockout guidance remain immediate.
- Reused the official local SaludVital login logo. CSS draws the ECG line, light rings, waves, particles, and indeterminate progress indicator in the existing brand palette; no animation dependency or external request was added.
- The script waits for the browser `load` event, which fires after the page's stylesheets, scripts, images, and other load-blocking resources complete. It then waits for visible images to decode before showing a brief completion message and dismissing the splash. A 15-second ceiling prevents stalled resources from trapping the page.
- A minimum display interval allows the entrance animation to be seen; it is not a fixed five-second hold. Without the splash script, a 15-second CSS fallback keeps the login accessible. Reduced-motion users skip the animation. The overlay is decorative, `aria-hidden`, inert, and does not intercept pointer interaction or change the underlying login layout.
- The original login form, password controls, registration and recovery links, WhatsApp links, and authentication flow are unchanged.

## Verification

- `npm run format`: passed; repository files were already formatted apart from the new files.
- Targeted Prettier check: passed.
- `npm test -- --runInBand`: 120 suites and 955 tests passed.
- Focused auth view/controller tests: 2 suites and 12 tests passed.
- `npm run lint`: passed.
- `npm run format:check`: passed.
- `npm run css:build`: passed.
- `node tests/e2e/app.e2e.js`: passed before the resource-readiness update; rerun after the update to validate delayed resources and responsive splash behavior.
- Full `npm run test:e2e`: stopped at the existing `admin-appointment-edit.e2e.js` scenario waiting for “Ese horario ya no está disponible.” The preceding application/login E2E checks passed; this failure is outside the login splash change.

## Limitations

The progress indicator is intentionally indeterminate and does not represent a measured percentage. When JavaScript is available, the splash waits for load-blocking page resources; the CSS-only fallback uses a fixed safety timeout because it cannot observe page readiness.
