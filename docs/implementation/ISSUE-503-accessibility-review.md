# Issue #503 — Accessibility review notes

**Review date:** 2026-11-18  
**Branch:** `docs/503-accessibility-review`  
**Status:** Automated, browser, and representative manual reviews are recorded. The contrast finding was fixed in PR #509 and Issue #504 is closed. The duplicate main landmarks were fixed in PR #519, merged into `develop` on 2026-11-20; Issue #505 is closed. The project owner confirmed screen-reader and keyboard checks on public Terms, Patient Notifications, Doctor Notifications, and Administrator Notifications pages. This review does not claim full WCAG conformance.

## Pages and states reviewed

The project Playwright suite was run after rebuilding the generated CSS bundle. It covered the public home and authentication flows, including login, password recovery, password reset, registration, password visibility, lockout, reduced motion, and splash fallback. It also covered representative Patient, Doctor, and Administrator pages. Existing browser checks exercise keyboard controls and dialogs, form labels and errors, responsive reflow, image rendering, loading/error states, and axe-core rules. Relevant files include `tests/e2e/app.e2e.js`, `tests/e2e/logout-confirmation.e2e.js`, `tests/e2e/patient-notification-history.e2e.js`, `tests/e2e/doctor-notifications.e2e.js`, and `tests/e2e/admin-notifications.e2e.js`.

The public legal pages were opened individually at 390×844, 768×1024, and 1280×900. They were also checked at a 640×400 viewport, which approximates a 1280×800 desktop viewport at 200% browser zoom. No horizontal overflow appeared at those sizes. Pressing Tab first focused the SaludVital sign-in link, with the browser's visible 1px focus outline.

## Confirmed findings

1. **More than one main landmark — resolved:** the shared wrapper in `views/legal/layout.pug` is the only `<main>` landmark. PR #519 removed the nested landmarks from the privacy, terms, and help content. The updated browser checks cover all three pages on mobile and desktop with axe-core. See [Issue #505](https://github.com/personalProjectsDeltaG8109/saludvital/issues/505) and the [change report](./ISSUE-505-public-legal-main-landmarks.md).

2. **Low contrast in terms section numbers — resolved:** the initial review measured 4.34:1 for `.legal-section-number`. PR #509 changed the text color, and the current contrast is 5.05:1. The issue was checked on mobile and desktop with axe-core and [Issue #504](https://github.com/personalProjectsDeltaG8109/saludvital/issues/504) is closed. The implementation is documented in the [Issue #504 change report](./ISSUE-504-terms-section-contrast.md).

The duplicate main landmarks are fixed and merged into `develop` through [PR #519](https://github.com/personalProjectsDeltaG8109/saludvital/pull/519); [Issue #505](https://github.com/personalProjectsDeltaG8109/saludvital/issues/505) is closed. The complete Playwright suite passed on rerun, including the browser-storage test; one earlier temporary 404 did not recur.

## Build artifact

The initial e2e run, before rebuilding CSS, failed because the tracked `public/css/app.css` did not contain the `.login-security-icon` rules already present in `src/styles/input.css`. Rebuilding CSS restored those generated rules, and the full e2e suite then passed. The generated bundle is included so the tracked output matches the source.

## Verification results

- `npm run format` — passed; no formatting changes were needed.
- The repository's explicit Prettier write command — passed; files were unchanged.
- `npm test` — passed: 154 suites and 1,187 tests.
- `npm run lint` — passed.
- `npm run css:build` — passed.
- `npm run test:e2e` — passed after the CSS build, including login and role-based browser flows, axe-core checks, keyboard dialogs, and responsive tests.
- `git diff --check` — passed.

## Remaining review

The project owner confirmed these representative manual checks:

- Public Terms: Windows Narrator reads the paragraphs in reading mode.
- Patient Notifications: Narrator reads the content and keyboard focus follows a clear order.
- Doctor Notifications: Narrator reads the content; the detail opens with Enter, closes with Escape, and returns focus to its trigger.
- Administrator Notifications: Narrator reads the content and the keyboard controls are clear.

The sample review is complete for these pages and states. It is not proof of full WCAG 2.2 AA compliance. Issues #504 and #505 are closed; PR #519 resolved the duplicate main landmarks.
