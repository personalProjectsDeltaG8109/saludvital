# Issue #420 — Restore Patient Appointment List Loading

## Cause

The paginated appointment query ordered upcoming visits with the joined `status.name` alias. MySQL could not resolve that alias inside Sequelize's pagination subquery, so `/patient/appointments` returned a server error.

## Change

- Reuse the confirmed status ID returned by the existing grouped status query.
- Rank upcoming confirmed appointments using `Appointment.status_id` and the existing Bogotá-local time boundary.
- Keep the existing history ordering, filters, counts, and page limits.
- Add a regression assertion that protects the ordering expression from referring to the unavailable join alias.

## Verification

- The patient appointment list service successfully queried the local MySQL database: 6 records were counted and loaded on page one.
- Focused Jest suites: 2 suites and 12 tests passed.
- ESLint passed for the changed JavaScript files.
- Prettier passed after formatting the service file.
- A full application/browser test run remains to be completed before opening a pull request.

No schema or dependency changes were required.
