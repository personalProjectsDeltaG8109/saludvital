# Issue #318 — Patient Appointment Notification History

## Goal

Show persisted appointment creation, rescheduling, and cancellation events in the patient's notification history. Keep in-app activity separate from WhatsApp, SMS, and email delivery records, and retain unread state until the patient opens an event or explicitly marks notifications as read.

## Implementation

- Reused `AppointmentHistory` and its existing appointment, doctor, and specialty records. Appointment event queries and detail retrieval are scoped to the authenticated patient's profile.
- Added a reversible `patient_appointment_history_reads` table because immutable appointment audit rows cannot safely store a patient's read receipt. The unique patient/event pair makes read updates idempotent.
- Combined unread counts from persisted provider notifications and appointment activity. The shared patient header refreshes the badge on page visibility and every 15 seconds; opening the history does not clear unread items.
- Added individual and mark-all read actions. The mark-all operation updates both record types in one database transaction.
- Added an accessible appointment detail dialog with the recorded event, appointment time, status, specialty, doctor name, and doctor photo when a safe local photo path exists. The protected endpoint conceals missing and non-owned events with the same not-found response.
- Appointment history remains informational. Provider delivery statuses are not inferred, and no patient contact, appointment reason, or clinical details are included.

## Scope and limitations

This change makes appointment lifecycle activity visible and readable inside SaludVital; it does not enable or simulate external delivery. WhatsApp, SMS, and email delivery still requires the existing delivery feature flag, enabled patient preferences, a destination, and valid provider configuration. Creation currently queues the existing 24-hour reminder when eligible; it does not send an immediate confirmation. Appointment rescheduling and cancellation retain their existing notification queue behavior.

## Verification

- Focused Jest and Supertest checks passed: 3 suites, 100 tests, including authenticated endpoint access, combined unread counts, patient scoping, explicit read actions, and appointment detail retrieval.
- Full Jest suite passed: 115 suites, 903 tests.
- ESLint and repository-wide Prettier checks passed.
- Tailwind CSS build completed successfully. The generated `public/css/app.css` output was restored because this change uses the existing standalone patient notification stylesheet.
- Playwright and axe-core checks passed for the appointment detail dialog, doctor photo, read actions, and mobile accessibility. The full E2E suite also passed.

## Deployment note

Apply migration `20261104110000-create-patient-appointment-history-reads.js` before using persistent read state in an environment. No existing appointment or notification records are altered by the migration.
