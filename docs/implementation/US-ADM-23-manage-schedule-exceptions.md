# US-ADM-23 — Manage Schedule Exceptions

## Acceptance criteria

Implements the approved US-ADM-23 criteria: administrator-only exception listing and management; database-backed `Unavailable` and `AdditionalAvailability` records; validation and impact review; explicit deactivation/reactivation; inactive exceptions excluded from availability; audit entries; Spanish, responsive, accessible UI states. Reasons such as vacation and leave remain descriptions, not exception types. Appointment records are never changed by this workflow.

## Implementation

- Added protected list, create, edit, and status endpoints backed by the existing exception, doctor, appointment, user, and audit models.
- Added an `is_active` field and `updated_at` timestamp through a reversible migration. Existing exceptions default to active.
- Added local date/time validation using the application's Colombia timezone and 30-minute increments. Only active doctors and the two persisted exception types are accepted.
- Added impact review for future confirmed appointments before saving changes that intersect their times. The administrator explicitly confirms; appointments remain unchanged.
- Added the exception manager to the existing schedule page with loading, empty, error, status filter, form, impact review, and responsive layouts.
- Updated booking and schedule reads to ignore inactive exceptions.

## Tests and checks

- `npm.cmd run db:test:prepare` — passed; applied pending migrations and the initial roles seeder to `saludvital_test`.
- `npm.cmd test -- --runInBand` — passed, 56 suites and 462 tests.
- `npm.cmd run test:e2e` — passed, including the exception manager flows and mobile/tablet/desktop overflow checks.
- `npm.cmd run lint` — passed.
- Prettier check on changed JavaScript, test, and package files — passed.
- Pug template compilation and `git diff --check` — passed.

## Limitations

- The exception schema supports only `Unavailable` and `AdditionalAvailability`; no additional exception categories were introduced.
- Appointment-impact review is informational and conservative. It does not resolve, cancel, or reschedule appointments.
- GitHub Issue: [#153](https://github.com/personalProjectsDeltaG8109/saludvital/issues/153), assigned to repository milestone #6, `Sprint 5 - Administration`.
