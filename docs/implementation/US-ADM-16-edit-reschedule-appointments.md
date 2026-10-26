# US-ADM-16 — Edit and Reschedule Medical Appointments

Issue [#139](https://github.com/personalProjectsDeltaG8109/saludvital/issues/139), assigned to Sprint 5 — Doctor Management (milestone ID 6).

## Acceptance criteria

- Only administrators can access the appointment editor and its protected endpoints.
- The editor pre-fills the selected appointment's patient, specialty, doctor, date, time, and reason.
- Editing is restricted to future appointments in the existing `Confirmed` lifecycle state and the existing maximum of three reschedules.
- The administrator can change the specialty, compatible active doctor, date, time, and optional reason; the patient and status remain unchanged.
- The server validates active specialty/doctor compatibility, availability, schedule exceptions, patient and doctor conflicts, date/time, and reason.
- Changes use the existing transaction, appointment history, and notification workflows. Validation failures occur before the update, and persistence failures roll back the transaction.
- Only existing appointment statuses are used; no pending status is introduced or rendered.
- Spanish feedback and responsive layouts support mobile, tablet, and desktop.

## Implementation

- Added a protected edit page and API endpoints for active specialties/doctors and appointment rescheduling.
- Extended the existing transactional reschedule service to support administrator actor data and provider/reason changes while keeping the patient self-service path intact.
- Locked old and new doctor rows in a stable order before the appointment row, then revalidated the appointment lifecycle and target scheduling rules.
- Recorded changed fields and administrator identity in the existing appointment history. Reused reminder cancellation and reschedule notification handling.
- Added edit links to confirmed appointments in the administrator directory and detail page.
- No schema change or new dependency was needed.

## Files

- src/modules/admin/routes/adminRoutes.js
- src/modules/admin/services/adminAppointmentEditingService.js
- src/modules/patient/services/appointmentService.js
- views/admin/appointment-edit.pug
- views/admin/appointment-details.pug
- public/js/admin-appointment-edit.js
- public/js/admin-appointments.js
- public/css/admin-appointments.css
- tests/unit/adminAppointmentEditingService.test.js
- tests/unit/patient/appointmentRescheduling.test.js
- tests/integration/app.test.js
- tests/e2e/admin-appointments.e2e.js
- tests/e2e/admin-appointment-edit.e2e.js
- package.json

## Verification

- `npm.cmd test -- --runInBand`: passed (48 suites, 405 tests).
- Focused edit, reschedule, and authorization checks: passed (3 suites, 41 tests).
- `npm.cmd run test:e2e`: passed, including the appointment directory and edit form at 375×812, 768×1024, and 1440×900. The browser flow checked prefilled values, provider selection, conflict handling, preserved values, and success confirmation.
- `npm.cmd run lint`: passed.
- `npm.cmd run format:check`: passed.
- `git diff --check`: passed.
- The browser E2E flow stubs the API responses; it does not modify a real appointment record. Database update behavior is covered through the transactional service unit tests, and no live appointment was changed during verification.

## Dependency and integration order

This branch is based on the latest `develop` at `e2e5932`, which includes US-ADM-15. US-ADM-17 has not been started.
