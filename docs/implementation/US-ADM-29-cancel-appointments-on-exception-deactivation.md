# US-ADM-29 — Cancel Appointments When Additional Availability Is Deactivated

Issue: [#162](https://github.com/personalProjectsDeltaG8109/saludvital/issues/162)

Milestone: #6 — Sprint 5 - Administration

Branch: `feature/us-adm-23-cancel-appointments-on-exception-deactivation`

## Implementation

- Deactivating an active `AdditionalAvailability` exception now finds future confirmed appointments that overlap its time window and sends them through the existing schedule-change cancellation workflow.
- The existing workflow updates appointment status, records appointment history and audit entries, cancels pending reminders, and queues cancellation notifications in the same database transaction as exception deactivation.
- Deactivation of `Unavailable`, reactivation, exception creation, and exception editing keep their existing review behavior and do not automatically cancel appointments.
- Updated exception status feedback to show cancellation details and the number of notifications queued. Failed cancellation work propagates so the transaction can roll back.
- Reused the existing exception, appointment, audit, status, and notification mechanisms. No schema or dependency changes were needed.

## Files

- `src/modules/admin/services/adminDoctorScheduleExceptionService.js`: finds overlapping future confirmed appointments and invokes the existing cancellation helper during `AdditionalAvailability` deactivation.
- `public/js/admin-doctor-schedules.js`: reports cancellation and queued-notification results to the administrator.
- `tests/unit/adminDoctorScheduleExceptionService.test.js`: covers cancellation delegation, unaffected exception types, and cancellation failures.
- `tests/e2e/admin-doctor-schedule-exceptions.e2e.js`: covers the status action and success feedback for automatic cancellation.

## Verification

- Targeted Jest checks for exception management and schedule configuration: 2 suites passed, 18 tests passed.
- `node tests/e2e/admin-doctor-schedule-exceptions.e2e.js`: passed creation, editing, status changes, impact review, automatic cancellation feedback, and responsive checks.
- ESLint on changed JavaScript and test files: passed.
- Prettier and `git diff --check`: passed.

## Limitations

- Only future confirmed appointments overlapping the deactivated additional-availability interval are cancelled.
- Cancellation notices are queued using the existing notification system; successful enqueueing does not guarantee external delivery.
