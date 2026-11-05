# BUG-324 — Refresh Doctor Schedules on Week Change

## Resolution

- Selecting a date in the administrator schedule week picker now normalizes it to Monday and reloads the schedule list, summary, exceptions, and selected doctor's weekly view.
- Existing search, doctor, specialty, and status filters remain applied during the refresh.
- Previous schedule and weekly requests are ignored when a newer selection has been made. Loading clears old week-specific values so they are not presented as current results.
- Added an end-to-end check that selects a Thursday, verifies the Monday request date, and confirms the existing search filter is preserved.

## Verification

- `node tests/e2e/admin-doctor-schedules.e2e.js` — passed, including mobile/tablet/desktop overflow checks and selected-week refresh.
- `npm run format` — passed.
- Required scoped Prettier write command — passed; files were unchanged.
- `npm run test -- --runInBand` — passed: 116 suites, 914 tests.
- `npm run lint` — passed.
- `npm run css:build` — passed; generated output was not part of this change.
- `npm run test:e2e` — passed, including axe-core checks in the available browser flows.

No database, migration, or dependency changes were required.
