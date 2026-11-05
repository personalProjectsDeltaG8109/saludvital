# Issue #309 - Sort Administrator Appointments by Status Priority

## Scope

Sort the administrator appointment directory and its export by the persisted appointment status priority: `Confirmed`, `In Progress`, `Attended`, then `Cancelled`. Within each status group, keep appointments ordered by `start_at` descending and ID descending.

The priority is built from supported status rows loaded from the database. Database IDs are normalized as safe integers before they are used in a Sequelize SQL literal. No status, business rule, schema, or dependency changes are included.

## Implementation

- Added a database-backed `CASE` order that applies `Confirmed`, `In Progress`, `Attended`, and `Cancelled` priority without relying on fixed database IDs.
- Kept descending appointment start time and ID as tie breakers within each status group.
- Applied the same ordering to the administrator export so exported rows follow the visible list order.
- Added unit coverage for status IDs returned in a different order and browser coverage across two paginated result pages.
- Updated the local checklist: #307 is marked complete; removing the manual search button remains pending until the other filters also update automatically.

## Verification

- `npm.cmd test -- --runInBand tests/unit/adminAppointmentService.test.js` - passed, 16 tests.
- `node tests/e2e/admin-appointments.e2e.js` — passed, including desktop/mobile layout, filters, exports, error states, and the new paginated status-order check.
- `npm.cmd run format` — passed; files already matched formatting.
- `npx.cmd prettier --write "app.js" "server.js" "package.json" "config/**/*.js" "tests/**/*.js" "views/**/*.pug" "src/styles/**/*.css" ".github/workflows/ci.yml" --plugin @prettier/plugin-pug` - passed; files unchanged.
- `npm.cmd test -- --runInBand` — passed, 113 suites and 872 tests.
- `npm.cmd run lint` — passed.
- `npm.cmd run format:check` — passed.
- `npm.cmd run css:build` — passed.
- `npm.cmd run test:e2e` — passed.
- `git diff --check` — passed.

## Status

Implementation and verification are complete on `feat/issue-309-admin-appointment-status-priority`. No database migration or new dependency was needed.
