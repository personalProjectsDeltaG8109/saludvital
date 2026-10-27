# US-ADM-24 — Review Appointments Affected by Schedule Changes

## Implementation

- Issue #155 is assigned to repository Milestone #6 (`Sprint 5 - Administration`).
- Added an administrator-only endpoint and paginated panel for future confirmed appointments whose full interval is outside active doctor availability or overlaps an active `Unavailable` exception.
- The panel displays the appointment reference, date and time in the Colombia timezone, doctor, persisted confirmed status, and either the stored exception reason and interval or the availability mismatch reason.
- Appointment details link to the existing administrator appointment-details page. The endpoint does not load patient, contact, or clinical data and does not modify appointments.
- The directory summary count and paginated list share the same query and affected-appointment calculation. Duplicate appointment rows are removed before counting and pagination.
- No schema or dependency changes were required.

## Files

- `src/modules/admin/services/adminDoctorScheduleService.js`: shared affected-appointment query, formatting, and pagination.
- `src/modules/admin/routes/adminRoutes.js`: protected JSON endpoint.
- `views/admin/doctor-schedules.pug`, `public/js/admin-doctor-schedules.js`, `public/css/admin-doctor-schedules.css`: responsive panel, loading/error/empty states, detail links, and pagination.
- `tests/unit/adminDoctorScheduleService.test.js`, `tests/integration/app.test.js`, `tests/e2e/admin-doctor-schedules.e2e.js`: service behavior, administrator authorization, and browser coverage.

## Verification

- Jest targeted unit and integration suites: 50 tests passed.
- ESLint on changed JavaScript files: passed.
- Prettier check on changed JavaScript files: passed.
- Pug template compilation: passed.
- Playwright schedule page: the affected appointment count, records, detail link, and pagination assertions passed. The run later fails at the pre-existing mobile weekly timeline compact-row assertion; that unrelated timeline issue remains outside this story.

## Limitations

Affected appointments are future appointments with persisted status `Confirmed`, matching the approved criteria. Resolving or changing an appointment remains outside this story.
