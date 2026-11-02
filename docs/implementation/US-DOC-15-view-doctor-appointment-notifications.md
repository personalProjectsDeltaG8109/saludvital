# US-DOC-15 — View Doctor Appointment Notifications

Issue: [#258](https://github.com/personalProjectsDeltaG8109/saludvital/issues/258)

## Implementation

- Added an authenticated doctor notification page, paginated API, unread-count endpoint, and idempotent mark-as-read endpoint.
- The feed uses only persisted `Created`, `Rescheduled`, and `Cancelled` appointment history events for appointments currently assigned to the authenticated doctor.
- Each item shows the event label, event time, and current appointment time. Patient names, contact details, appointment reasons, and clinical data are not returned.
- Added an additive, reversible `doctor_appointment_notification_reads` table because appointment history is immutable and the existing `notifications` table is patient-scoped. A unique doctor/event constraint makes read updates idempotent.
- The doctor top-bar bell links to the feed and loads its unread count from the protected endpoint. The feed has keyboard-accessible read controls and responsive empty and pagination states.
- No patient notification, appointment state, or history record is changed.

## Verification

- Focused Jest/Supertest suites: 4 suites and 34 tests passed.
- Full Jest suite: 109 suites and 799 tests passed.
- Full Playwright E2E suite passed, including the doctor notification mobile layout and axe-core check.
- ESLint, Prettier format check, and Tailwind CSS build passed.

## Limitations

- Historical notifications are derived from appointment events; no separate doctor notification delivery system exists.
- Events follow the appointment's current doctor assignment. A doctor who was previously assigned to a rescheduled appointment does not receive that event.
- The migration must be applied in the target environment before the read-state endpoints can work.
