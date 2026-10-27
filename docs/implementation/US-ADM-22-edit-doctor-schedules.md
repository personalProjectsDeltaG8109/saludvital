# US-ADM-22 — Edit Doctor Schedules

## Tracking

- GitHub Issue: [#151](https://github.com/personalProjectsDeltaG8109/saludvital/issues/151)
- Milestone: #6 — Sprint 5 - Administration
- Branch: `feature/us-adm-22-edit-doctor-schedules`

## Acceptance criteria

Implementation follows the 15 acceptance criteria recorded in Issue #151, with the administrator's later instruction that appointments affected by a confirmed schedule change are cancelled and patients notified. Existing weekly availability blocks can be edited individually; the system-wide 30-minute appointment duration remains informational because the current model does not store a per-doctor duration.

## Implementation

- Added edit actions beside configured intervals in the schedule directory and weekly information panel. Persisted availability blocks in the weekly grid are also keyboard-accessible edit controls. The editor is prefilled from the selected block.
- Added an explicit remove-interval action to the editor. It deactivates the persisted availability block rather than deleting its historical record, and records the change in the audit log.
- Added a protected schedule update endpoint and a focused service that reuses the configuration validation and impact-checking rules. Editing can update the selected interval and add further non-overlapping intervals in one transaction.
- The server validates date ranges, business hours, 30-minute booking boundaries, interval overlaps, active doctor eligibility, and that one existing interval is edited per request.
- The update locks the schedule, doctor, and affected appointment rows, recomputes future confirmed appointment and stored Unavailable exception impacts, and requires explicit confirmation before applying the change.
- Removing an interval uses the same transactional impact check. The administrator reviews affected appointments before confirming their cancellation and notification; removing a block without affected appointments still requires the initial explicit browser confirmation.
- After confirmation, affected appointments are cancelled, their pending reminders are stopped, cancellation notifications are enqueued using patient preferences, and appointment history and audit entries are recorded in the same transaction as the schedule update.
- The weekly schedule endpoint exposes the existing block identifiers and validity dates needed by the editor. No new table, migration, or dependency was added.

## Files

- `src/modules/admin/services/adminDoctorScheduleEditingService.js`: validated transactional update and audit logging.
- `src/modules/admin/services/adminDoctorScheduleConfigurationService.js`: shared validation and schedule-impact helpers reused by editing.
- `src/modules/admin/services/adminDoctorWeeklyScheduleService.js`: includes persisted block data for edit actions.
- `src/modules/admin/routes/adminRoutes.js`: administrator-protected update endpoint.
- `src/modules/admin/services/adminDoctorScheduleEditingService.js` and `src/modules/admin/routes/adminRoutes.js`: transactional interval removal endpoint with appointment impact confirmation and audit logging.
- `views/admin/doctor-schedules.pug`, `public/js/admin-doctor-schedules.js`, `public/css/admin-doctor-schedules.css`: prefilled editor, edit actions, and responsive layout.
- `tests/unit/adminDoctorScheduleEditingService.test.js`, `tests/integration/app.test.js`, `tests/e2e/admin-doctor-schedule-edit.e2e.js`: update/removal, audit, authorization, impact-confirmation, and browser-flow coverage.
- `package.json`: includes the edit browser check in `test:e2e`.

## Verification

- The original US-ADM-22 implementation passed 54 suites and 447 tests before the cancellation follow-up; the full suite was not rerun after that follow-up.
- The schedule configuration, schedule editing, and weekly schedule unit suites passed: 3 suites and 19 tests.
- The schedule configuration and schedule editing browser checks passed, including impact confirmation and responsive checks at 375x812, 768x1024, and 1440x900.
- ESLint, Prettier, Pug compilation, and git diff --check passed.
- Interval removal follow-up: the schedule editing unit and application integration suites passed (53 tests total); the schedule editing browser check passed, including deletion impact confirmation and responsive overflow checks at 375x812, 768x1024, and 1440x900. ESLint, Prettier for supported files, Pug compilation, and `git diff --check` passed. Prettier does not have a parser configured for Pug, so the updated template was verified by compilation.

## Remaining limitations

Appointment duration is system-wide and cannot be changed for an individual doctor. The exception model has no active flag, so stored Unavailable records are treated as effective under existing booking rules. External notification delivery still depends on the existing notification configuration and each patient's channel preferences.
