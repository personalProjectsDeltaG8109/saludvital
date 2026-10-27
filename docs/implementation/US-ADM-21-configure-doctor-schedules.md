# US-ADM-21 — Configure Doctor Schedules

## Tracking

- GitHub Issue: [#149](https://github.com/personalProjectsDeltaG8109/saludvital/issues/149)
- Milestone: #6 — Sprint 5 - Administration
- Branch: `feature/us-adm-21-configure-doctor-schedules`

## Acceptance criteria

This implementation follows the 14 acceptance criteria in Issue #149. Administrators can configure active doctors' working days and weekly intervals; the shared 30-minute appointment duration remains informational and is not editable.

## Implementation

- Added a responsive configuration dialog to the existing schedule page with doctor selection, validity dates, enabled weekdays, one or more intervals per day, and a fixed appointment-duration note.
- Added an administrator-protected endpoint and service using the existing doctor, availability, appointment, status, and exception models.
- Server validation checks active doctor eligibility, date and business-hour ranges, 30-minute increments, self-overlapping intervals, and overlap with active blocks for intersecting weekdays and validity dates.
- Schedule writes and impact checks run in a database transaction while locking the doctor's row. Existing appointments are not changed.
- Before saving, the administrator receives a list of future confirmed appointments that would be outside the resulting availability or overlap a stored Unavailable exception. The backend recalculates this list when confirmation is submitted.
- The exception model has no active flag; stored Unavailable exceptions are treated as effective under existing booking rules. No schema migration or dependency change was needed.
- Availability is appended to the existing schedule; editing or removing configured blocks remains outside this story.

## Files

- `src/modules/admin/services/adminDoctorScheduleConfigurationService.js`: validation, impact checks, and transactional persistence.
- `src/modules/admin/routes/adminRoutes.js`: administrator-protected configuration endpoint.
- `views/admin/doctor-schedules.pug`, `public/js/admin-doctor-schedules.js`, `public/css/admin-doctor-schedules.css`: configuration dialog and responsive interaction.
- `tests/unit/adminDoctorScheduleConfigurationService.test.js`, `tests/integration/app.test.js`, `tests/e2e/admin-doctor-schedule-configuration.e2e.js`: service, authorization, and browser-flow coverage.
- `package.json`: includes the configuration E2E check in `test:e2e`.

## Verification

- `npm test -- --runInBand`: 53 suites and 438 tests passed.
- `npm run lint`: passed.
- `node tests/e2e/admin-doctor-schedules.e2e.js`: passed, including the existing weekly view and responsive checks.
- `node tests/e2e/admin-doctor-schedule-configuration.e2e.js`: passed, including explicit impact confirmation and no horizontal overflow at 375×812, 768×1024, and 1440×900.
- Prettier check, Pug compilation, and `git diff --check`: passed.

## Remaining limitations

The current exception model does not distinguish active from inactive exceptions. Existing stored Unavailable records remain effective, matching the appointment-booking service. Schedule editing and exception management belong to later stories.
