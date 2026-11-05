# Issue #322 — Automatic Administrator Appointment Filters

## Scope

Make the existing administrator appointment directory apply its date, status, specialty, doctor, and patient search criteria without a manual search submission. Remove the redundant **Buscar** button after all supported controls refresh the list.

## Implementation

- Reused the existing protected appointments endpoint and filter parameters. No backend query, schema, dependency, or appointment rule changed.
- Date, status, specialty, and doctor controls now refresh results when their values change. Patient search retains its existing debounce.
- All criteria remain combined. A filter change cancels pending patient-search work, resets pagination to page one, and uses the existing request sequence guard to ignore stale responses.
- Removed the manual **Buscar** button and its dedicated styles. The search form still supports keyboard submission.
- Updated the Playwright browser flow to verify automatic requests, preserved filters, pagination reset, and existing empty/error behavior.

## Verification

- Focused Playwright flow: `node tests/e2e/admin-appointments.e2e.js` passed, including automatic filter refresh, combined criteria, page reset, stale-response protection, empty/error states, and viewport checks from 375px through desktop.
- Jest: 116 suites and 914 tests passed.
- Full Playwright suite: `npm run test:e2e` passed, including the appointment directory and available axe-core accessibility checks.
- `npm run format`: passed.
- Repository Prettier write command: passed; files were unchanged after formatting.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run css:build`: passed. The generated global CSS change was discarded because this story adds no global Tailwind styles.
- `git diff --check`: passed.
