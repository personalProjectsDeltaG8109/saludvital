# US-ADM-22 — Edit Doctor Schedules

## Tracking

- GitHub Issue: [#151](https://github.com/personalProjectsDeltaG8109/saludvital/issues/151)
- Milestone: #6 — Sprint 5 - Administration
- Branch: `feature/us-adm-22-edit-doctor-schedules`

## Acceptance criteria

Implementation follows the 15 acceptance criteria recorded in Issue #151. Existing weekly availability blocks can be edited individually; the system-wide 30-minute appointment duration remains informational because the current model does not store a per-doctor duration.

## Implementation

- Added edit actions beside configured intervals in the schedule directory and weekly information panel. The editor is prefilled from the selected persisted block.
- Added a protected schedule update endpoint and a focused service that reuses the configuration validation and impact-checking rules.
- The server validates date ranges, business hours, 30-minute booking boundaries, interval overlaps, active doctor eligibility, and that one existing interval is edited per request.
- The update locks the schedule and doctor rows, recomputes future confirmed appointment and stored Unavailable exception impacts, and requires explicit confirmation before saving.
- Updates and an audit entry containing the previous and proposed schedule values are written in one transaction. Appointment rows are never changed.
- The weekly schedule endpoint exposes the existing block identifiers and validity dates needed by the editor. No new table, migration, dependency, or appointment-resolution workflow was added.

## Files

- `src/modules/admin/services/adminDoctorScheduleEditingService.js`: validated transactional update and audit logging.
- `src/modules/admin/services/adminDoctorScheduleConfigurationService.js`: shared validation and schedule-impact helpers reused by editing.
- `src/modules/admin/services/adminDoctorWeeklyScheduleService.js`: includes persisted block data for edit actions.
- `src/modules/admin/routes/adminRoutes.js`: administrator-protected update endpoint.
- `views/admin/doctor-schedules.pug`, `public/js/admin-doctor-schedules.js`, `public/css/admin-doctor-schedules.css`: prefilled editor, edit actions, and responsive layout.
- `tests/unit/adminDoctorScheduleEditingService.test.js`, `tests/integration/app.test.js`, `tests/e2e/admin-doctor-schedule-edit.e2e.js`: update, audit, authorization, impact-confirmation, and browser-flow coverage.
- `package.json`: includes the edit browser check in `test:e2e`.

## Verification

- `npm test -- --runInBand`: 54 suites and 447 tests passed.
- `npm run lint`: passed.
- The existing weekly schedule, configuration, and new editing E2E checks passed. The editing check verifies prefilling, affected appointment confirmation, successful refresh, and no horizontal overflow at 375×812, 768×1024, and 1440×900.
- Prettier, Pug compilation, and `git diff --check`: passed.

## Remaining limitations

Appointment duration is system-wide and cannot be changed for an individual doctor. The exception model has no active flag, so stored Unavailable records are treated as effective under existing booking rules. The editor changes one availability block at a time; it does not cancel, delete, or reschedule appointments. Any appointment resolution requires a separately authorized workflow.
