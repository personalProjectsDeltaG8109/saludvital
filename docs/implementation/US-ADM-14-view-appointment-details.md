# US-ADM-14 — View Medical Appointment Details

Issue [#135](https://github.com/personalProjectsDeltaG8109/saludvital/issues/135), assigned to Sprint 5 — Doctor Management (milestone ID 6).

## Acceptance criteria

- Only authenticated administrators can access the appointment details page and API.
- The selected appointment is loaded from persisted appointment, patient, doctor, specialty, and status records.
- The page displays its identifier, date/time, status, patient, specialty, and assigned doctor.
- Only supported appointment statuses are displayed, using the existing Spanish labels.
- The API omits patient document and phone values, appointment reasons, source metadata, passwords, and authentication credentials.
- Missing, invalid, or unsupported-status records return a safe not-found result.
- The responsive details page reuses the administrator shell and links back to the appointment directory.

## Implementation

- Added a safe details lookup to the existing administrator appointment service. It selects only fields required by the read-only view and reuses the existing status mapping.
- Added administrator-protected API and page routes. The page returns the existing not-found view for missing or unsupported appointments.
- Added a details page using the appointment reference styles and a details link from desktop rows and mobile cards.
- Did not add appointment editing, rescheduling, status controls, or other appointment workflows.
- No migration or new dependency was needed.

## Files

- src/modules/admin/services/adminAppointmentService.js
- src/modules/admin/routes/adminRoutes.js
- views/admin/appointments.pug
- views/admin/appointment-details.pug
- public/js/admin-appointments.js
- public/css/admin-appointments.css
- tests/unit/adminAppointmentService.test.js
- tests/integration/app.test.js
- tests/e2e/admin-appointments.e2e.js
- tests/e2e/admin-appointment-details.e2e.js
- package.json

## Verification

- `npm.cmd test -- --runInBand`: passed (45 suites, 382 tests).
- Focused appointment unit/integration checks: passed (3 suites, 36 tests).
- `npm.cmd run test:e2e`: passed, including the appointment directory and detail page at 375×812, 768×1024, and 1440×900.
- `npm.cmd run lint`: passed.
- `npm.cmd run format:check`: passed.
- `git diff --check`: passed.
- E2E assertions confirm the displayed appointment status is from the supported status set; the detail view does not render unsupported status labels.

## Dependency and integration order

This branch is based on develop at acd8c58, which includes US-ADM-13. US-ADM-15 has not been started.
