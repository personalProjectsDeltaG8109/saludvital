# US-DOC-15 — View Doctor Appointment Notifications

Issue: [#258](https://github.com/personalProjectsDeltaG8109/saludvital/issues/258)

## Implementation

- Added an authenticated doctor notification page, paginated API, unread-count endpoint, and idempotent mark-as-read endpoint.
- The feed uses only persisted `Created`, `Rescheduled`, and `Cancelled` appointment history events for appointments currently assigned to the authenticated doctor.
- Each item shows the event label, event time, and current appointment time. Patient names, contact details, appointment reasons, and clinical data are not returned.
- Selecting a notification opens a keyboard-accessible native dialog with only the event label and persisted timestamps; all values are assigned as text.
- Added a doctor-scoped bulk read endpoint that inserts read-state rows for all currently unread eligible history events and returns the refreshed unread count. The existing unique doctor/event constraint keeps the operation idempotent.
- Added an additive, reversible `doctor_appointment_notification_reads` table because appointment history is immutable and the existing `notifications` table is patient-scoped. A unique doctor/event constraint makes read updates idempotent.
- The doctor top-bar bell links to the feed and loads its unread count from the protected endpoint. Individual and bulk read controls, details, empty states, and pagination are responsive and keyboard accessible.
- No patient notification, appointment state, or history record is changed.

## Verification

- Focused Jest/Supertest suites: 4 suites and 34 tests passed.
- Full Jest suite: 109 suites and 799 tests passed.
- Full Playwright E2E suite passed, including the doctor notification mobile layout and axe-core check.
- ESLint, Prettier format check, and Tailwind CSS build passed.

## Follow-up verification

- Focused Jest/Supertest suites: 2 suites and 15 tests passed for the individual and bulk read behavior and doctor authorization.
- Doctor notification Playwright E2E passed, including detail dialog interaction, bulk read behavior, mobile overflow, and axe-core accessibility checks.
- ESLint passed.

## Limitations

- Historical notifications are derived from appointment events; no separate doctor notification delivery system exists.
- Events follow the appointment's current doctor assignment. A doctor who was previously assigned to a rescheduled appointment does not receive that event.
- The migration must be applied in the target environment before the read-state endpoints can work.
- The detail dialog exposes only fields already present in the safe feed projection; the history table may contain additional values that are deliberately not disclosed.
