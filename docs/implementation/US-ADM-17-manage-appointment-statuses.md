# US-ADM-17 — Manage Medical Appointment Statuses

## Acceptance criteria

- Verify the current appointment status before permitting a transition and reject invalid or conflicting changes.
- Use only the existing appointment statuses: `Confirmed`, `In Progress`, `Attended`, and `Cancelled`.
- Confirm administrator cancellation and collect an optional reason; the current cancellation rules do not require a reason.
- Preserve appointment records, history, audit, reminders, notifications, and the doctor-deactivation workflow.
- Protect the endpoint with the existing administrator authentication and authorization middleware.
- Keep user-facing status and error text in Spanish, with a responsive cancellation dialog.

## Implementation

- Added `PATCH /api/admin/appointments/:appointmentId/status` for administrator cancellation.
- The service locks the appointment in a transaction and allows cancellation only from `Confirmed` when the appointment has not started. It records appointment history and an audit log, cancels pending reminders, and enqueues the existing cancellation notification.
- Added a confirmation dialog with an optional reason and cancellation actions to the appointment directory. Existing doctor workflows continue to transition appointments to `In Progress` and `Attended`; doctor deactivation was not modified.
- The directory continues to expose only the supported appointment lifecycle statuses; no `Pending` status was added.
- No schema migration or dependency was required.

## Files changed

- `src/modules/admin/services/adminAppointmentStatusService.js` — transactional status validation and cancellation behavior.
- `src/modules/admin/routes/adminRoutes.js` — protected status endpoint.
- `views/admin/appointments.pug`, `public/js/admin-appointments.js`, `public/css/admin-appointments.css` — responsive cancellation UI.
- `tests/unit/adminAppointmentStatusService.test.js` — service transition, history, audit, notification, and validation coverage.
- `tests/integration/app.test.js` — unauthenticated endpoint protection.
- `tests/e2e/admin-appointments.e2e.js` — cancellation confirmation and responsive directory checks.

## Verification

- Full unit and integration suite: `npm test -- --runInBand` — 49 suites, 410 tests passed.
- Full browser suite: `npm run test:e2e` — passed all existing E2E flows, including cancellation confirmation and responsive appointment-directory checks at mobile (375×812), tablet (768×1024), and desktop (1440×900).
- ESLint passed on changed JavaScript files.
- Pug template compilation passed.
- Prettier check passed for changed JavaScript files.

## Dependencies and remaining work

- US-ADM-13 through US-ADM-16 provide the appointment directory, details, creation, and rescheduling used by this implementation.
- Administrator cancellation does not use the patient portal's 24-hour cutoff; it follows the existing administrator deactivation behavior for future confirmed appointments.
- No known functional work remains for this story.
