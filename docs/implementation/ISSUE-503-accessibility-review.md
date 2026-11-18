# Issue #503 â€” Accessibility review notes

**Review date:** 2026-11-18  
**Branch:** `docs/503-accessibility-review`  
**Status:** Automated and browser review recorded. The contrast finding was fixed in PR #509 and Issue #504 is closed. The project owner confirmed that Windows Narrator reads the terms paragraphs in reading mode. Issue #503 remains open for screen-reader checks on representative authenticated pages and a full manual keyboard review; this review does not claim WCAG conformance.

## Pages and states reviewed

The project Playwright suite was run after rebuilding the generated CSS bundle. It covered the public home and authentication flows, including login, password recovery, password reset, registration, password visibility, lockout, reduced motion, and splash fallback. It also covered representative Patient, Doctor, and Administrator pages. Existing browser checks exercise keyboard controls and dialogs, form labels and errors, responsive reflow, image rendering, loading/error states, and axe-core rules. Relevant files include `tests/e2e/app.e2e.js`, `tests/e2e/logout-confirmation.e2e.js`, `tests/e2e/patient-notification-history.e2e.js`, `tests/e2e/doctor-notifications.e2e.js`, and `tests/e2e/admin-notifications.e2e.js`.

The public legal pages were opened individually at 390Ã—844, 768Ã—1024, and 1280Ã—900. They were also checked at a 640Ã—400 viewport, which approximates a 1280Ã—800 desktop viewport at 200% browser zoom. No horizontal overflow appeared at those sizes. Pressing Tab first focused the SaludVital sign-in link, with the browser's visible 1px focus outline.

## Confirmed findings

1. **More than one main landmark:** the shared wrapper in `views/legal/layout.pug:14` is a `<main>`, while the terms and help content also use `<main>` in `views/legal/terms-and-conditions.pug:4` and `views/legal/help.pug:4`. The privacy page has another main landmark in `views/legal/partials/privacy-policy-content.pug:1`. axe-core reports `landmark-main-is-top-level` and `landmark-no-duplicate-main` on all three pages. Follow-up: [Issue #505](https://github.com/personalProjectsDeltaG8109/saludvital/issues/505).

2. **Low contrast in terms section numbers â€” resolved:** the initial review measured 4.34:1 for `.legal-section-number`. PR #509 changed the text color, and the current contrast is 5.05:1. The issue was checked on mobile and desktop with axe-core and [Issue #504](https://github.com/personalProjectsDeltaG8109/saludvital/issues/504) is closed. The implementation is documented in the [Issue #504 change report](./ISSUE-504-terms-section-contrast.md).

No source fix for the duplicate main landmarks is included here; that defect has its own follow-up in Issue #505.

## Build artifact

The initial e2e run, before rebuilding CSS, failed because the tracked `public/css/app.css` did not contain the `.login-security-icon` rules already present in `src/styles/input.css`. Rebuilding CSS restored those generated rules, and the full e2e suite then passed. The generated bundle is included so the tracked output matches the source.

## Verification results

- `npm run format` â€” passed; no formatting changes were needed.
- The repository's explicit Prettier write command â€” passed; files were unchanged.
- `npm test` â€” passed: 154 suites and 1,187 tests.
- `npm run lint` â€” passed.
- `npm run css:build` â€” passed.
- `npm run test:e2e` â€” passed after the CSS build, including login and role-based browser flows, axe-core checks, keyboard dialogs, and responsive tests.
- `git diff --check` â€” passed.

## Remaining review

The project owner confirmed that Windows Narrator reads paragraphs on the terms page when using reading mode; Tab alone moves between interactive controls and does not read each paragraph. This is a spot check of one public page, not a review of all page types. The automated checks and browser keyboard probes are evidence for the states above, not proof of WCAG 2.2 AA compliance. Screen-reader checks on representative Patient, Doctor, and Administrator pages and a complete manual keyboard path review remain before Issue #503 can be closed. Issue #504 has been fixed and closed; the duplicate main landmarks remain tracked separately in Issue #505.

