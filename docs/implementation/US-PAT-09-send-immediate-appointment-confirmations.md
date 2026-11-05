# US-PAT-09 — Send Immediate Appointment Confirmations

## Scope

This story extends the appointment notification work in US-PAT-08 (#76). It sends a confirmation after the shared transactional booking service creates an appointment for a patient, administrator, or WhatsApp chatbot. It does not add a confirmation toggle to patient notification preferences.

## Implementation

- Reused `bookAppointment`, the notification queue, persisted `Notification` records, patient channel preferences and destinations, and the existing provider adapters.
- Queued confirmation records in the appointment transaction, after appointment history and audit writes. A failed booking transaction therefore cannot leave a confirmation job for a booking that did not persist.
- Confirmations follow enabled channel preferences without requiring a new per-event preference entry. Existing delivery retries operate on the same notification row; repeated enqueue attempts check for an existing confirmation for the appointment.
- Resend email and Inalambria SMS use the existing provider adapters. Messages include the appointment date, time, doctor, and specialty from persisted appointment relationships and omit appointment reasons and clinical information.
- WhatsApp uses the `META_WHATSAPP_CONFIRMATION_TEMPLATE_NAME` environment setting and four approved template body parameters in this order: date, time, doctor, specialty. If Meta's approved template is not configured, the existing worker records a safe permanent configuration failure instead of sending an unapproved free-form message.
- The global `NOTIFICATION_DELIVERY_ENABLED` switch remains authoritative. Provider acceptance remains distinct from delivery confirmation.
- No migration or dependency was required; `event_type` is a string in the current notifications table.

## External prerequisites

- Create and obtain approval for a Meta WhatsApp appointment-confirmation template whose body placeholders match the documented parameter order; configure its name in the server environment.
- Verify the Resend sender domain and enable the Inalambria account before production delivery.
- External sends remain disabled until the existing global delivery switch is enabled. Tests use provider mocks and do not send real messages.

## Verification

- Focused Jest: 5 suites and 34 tests passed, covering booking scheduling/rollback, preference routing, duplicate enqueue prevention, the global delivery switch, message content, Resend, and Meta template configuration.
- Full Jest suite: 116 suites and 914 tests passed.
- Playwright E2E suite: passed, including the existing appointment creation, patient dashboard, and notification history flows; axe-core checks in the suite passed.
- ESLint: passed.
- Prettier write commands and `format:check`: passed; no unrelated files changed.
- Tailwind CSS build: passed.
- No live provider message was sent. Real channel verification remains pending the provider prerequisites listed above.
