# US-ADM-07 — Activate or Deactivate Doctor

## Story and acceptance criteria

Issue #117 (Sprint 5). Administrators can activate or deactivate a doctor's account, with an explicit deactivation confirmation, immediate authentication enforcement, cancellation of eligible future appointments, preserved appointment history, patient notifications through the existing preference-aware queue, audit records, and responsive controls.

## Implementation notes

- `src/modules/admin/services/adminDoctorService.js` exposes a status impact preview and performs doctor status changes in a database transaction. Deactivation cancels future appointments in the canonical `Confirmed` status, writes one `AppointmentHistory` record per cancellation, cancels pending reminders, queues cancellation notices through the existing automation service, updates the account, and writes an audit record. Past, in-progress, attended, and already-cancelled appointments remain unchanged.
- `src/modules/admin/routes/adminRoutes.js` protects both status endpoints with the existing administrator middleware. `src/modules/admin/services/adminUserManagementService.js` prevents the generic account endpoint from bypassing doctor appointment handling.
- `public/js/admin-doctors.js`, `views/admin/doctors.pug`, `views/admin/doctor-details.pug`, and `public/css/admin-doctors.css` add status actions and a mobile-friendly confirmation that explains access loss, affected appointments, notifications, and reactivation behavior. The generic status toggle is hidden for doctor accounts in `public/js/admin-users.js`.
- `src/modules/patient/services/appointmentService.js` uses a locking account recheck after acquiring the doctor lock and acquires locks in doctor-then-appointment order while rescheduling. This prevents new bookings or reschedules from racing with deactivation.
- No migration was required. Existing authentication checks the current account status on protected requests. The existing notification worker handles delivery retries after the transaction commits; reactivation does not restore cancelled appointments.

## Verification

- `npm test -- --runInBand` — 41 suites and 338 tests passed.
- `npm run lint` and `npm run format:check` passed.
- `npm run test:e2e` passed, including a Playwright status UI scenario with mocked API responses for confirmation, cancellation, deactivation, and reactivation at 320 px from both the directory and doctor profile. Service behavior is covered by Jest unit tests, and route protection is covered by integration tests.
- `npm run css:build` passed. Both changed Pug views compiled successfully, and `git diff --check` passed.

## Dependencies and remaining work

This story depends on US-ADM-06, integrated into `develop`. Notification delivery continues to follow existing global configuration, patient preferences, and channel availability.
