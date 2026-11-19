# Issue #505 — One main landmark on public legal pages

## Problem

The shared legal page already has a main area. Privacy, terms, and help added another one inside it. Screen readers and accessibility checks can then find more than one main area on the same page.

## Change

The shared layout remains the only main area. The page content keeps its existing styling and labels inside ordinary containers. Integration and browser checks verify all three pages on mobile and desktop.

## Verification

- `npm test -- --runInBand tests/integration/legalPages.test.js` — passed: 1 suite, 9 tests.
- `node tests/e2e/app.e2e.js` — passed, including mobile and desktop landmark checks for all three pages and axe-core checks.
- `npm test -- --runInBand` — passed: 154 suites, 1,199 tests.
- `npm run lint`, `npm run format:check`, and `npm run css:build` — passed.
- `npm run test:e2e` — passed: all configured Playwright flows, including browser storage and the legal landmark/axe checks. An earlier attempt saw a temporary 404 during the browser-storage readiness check; the isolated test and complete suite passed on rerun.
