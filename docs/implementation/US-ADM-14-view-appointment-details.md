# US-ADM-14 — View Medical Appointment Details

Issue [#135](https://github.com/personalProjectsDeltaG8109/saludvital/issues/135), assigned to Sprint 5 — Doctor Management (milestone ID 6).

## Acceptance criteria

- Only administrators can request appointment details.
- The selected appointment is loaded from the appointment, patient, doctor, specialty, and status records.
- The modal shows the appointment number, date and time, patient name and photo, patient document and phone, specialty, doctor, and status.
- Only supported appointment statuses are displayed, using the existing Spanish labels.
- The response does not include the appointment reason, source metadata, passwords, credentials, or clinical history.
- Missing, invalid, or unsupported-status records return a safe not-found result.
- Details open inside the appointment list and work on desktop and mobile; there is no separate details page.

## Implementation

- Updated the administrator details lookup to return only the patient contact fields needed in the modal and reused the existing status mapping.
- Added a responsive modal that loads the selected appointment from the protected API.
- Replaced the separate details-page action in desktop rows and mobile cards with an icon button that opens the modal.
- Removed the old details page and route. The edit page now returns to the appointment list.
- Did not add appointment editing, rescheduling, status controls, or other appointment workflows.
- No migration or new dependency was needed.

## Files

- src/modules/admin/services/adminAppointmentService.js
- src/modules/admin/routes/adminRoutes.js
- views/admin/appointments.pug
- public/js/admin-appointments.js
- public/css/admin-appointments.css
- tests/unit/adminAppointmentService.test.js
- tests/integration/app.test.js
- tests/e2e/admin-appointments.e2e.js
- tests/e2e/admin-appointment-details.e2e.js
- package.json

## Verification

- The test suite without database integration tests passed: 126 suites and 977 tests.
- The application integration suite passed: 1 suite and 85 tests.
- The appointment directory, CSV/PDF export, details modal, creation flow, and edit flow passed their browser tests.
- `npm run lint`, `npm run format`, `npx prettier --write ...`, and `npm run css:build` passed.
- `git diff --check` passed.
- The full browser suite needs MySQL credentials for `saludvital_test`; it could not start because the local checkout has no database user configured.

## Dependency and integration order

This branch is based on develop at acd8c58, which includes US-ADM-13. US-ADM-15 has not been started.
