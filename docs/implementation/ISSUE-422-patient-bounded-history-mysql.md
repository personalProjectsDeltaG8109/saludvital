# Issue #422 — Verify Patient History Pagination with MySQL

## Scope

Verify the bounded patient appointment and clinical-history queries against the dedicated MySQL test database. This is a test and reliability follow-up to #416 and #418; it does not add a patient-facing feature or change business rules.

## Implementation

- Added a guarded MySQL integration suite that creates 120 synthetic appointments and completed consultations for one isolated test patient. The suite refuses to run unless `NODE_ENV=test` and `DB_NAME=saludvital_test`.
- Exercised three pages of 50, 50, and 20 records for each patient history service. Assertions verify totals, page limits, complete unique record coverage, and newest-first ordering.
- Removed all fixture consultations, appointment history, appointments, patient and doctor accounts, and any test-only specialty or status created by the suite.
- Fixed the clinical-history total query: its prior reuse of list projections caused MySQL `ONLY_FULL_GROUP_BY` to reject the consultation count. The count now uses only the status filter and joins required for patient ownership.
- Added a unit assertion that keeps list-only attributes and ordering out of the aggregate count query.
- No migration, runtime dependency, or business-rule change was introduced.

## Verification

- Focused MySQL integration and related service tests — passed: 3 suites, 10 tests.
- `npm.cmd test -- --runInBand` — passed: 135 suites, 1,065 tests.
- `npm.cmd run lint` — passed.
- CI Prettier check for application, tests, Pug views, styles, and workflow files — passed.
- `npm.cmd run css:build` — passed; the pre-existing `public/css/app.css` was restored byte-for-byte.
- `npm.cmd run test:e2e` — passed, including browser and axe-core accessibility checks.
- `git diff --check` — passed.

## Limitations

The integration suite requires a reachable and migrated `saludvital_test` MySQL database. It must never be configured to target a development or production database.
