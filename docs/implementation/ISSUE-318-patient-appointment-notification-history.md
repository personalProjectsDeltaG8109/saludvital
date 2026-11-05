# Issue #318 — Patient Appointment Notification History

## Goal

Show patients the persisted creation, rescheduling, and cancellation events for their appointments in the notification history, even when no external delivery is configured. Keep these in-app activity records separate from WhatsApp, SMS, and email delivery records.

## Implementation

- Reused `AppointmentHistory` and its existing appointment association; no migration or new table was needed.
- Scoped appointment events to the authenticated patient's patient record and limited the query to the latest 20 creation, rescheduling, and cancellation events.
- Merged appointment activity with persisted provider notification records and sorted the combined history by event time.
- Labeled appointment activity as “En SaludVital” and “Registrada”. Provider statuses remain separate; `Sent` is labeled “Aceptado por el proveedor”, not delivered.
- Included only appointment schedule details needed to explain the event. Appointment reasons, contact details, and clinical data are excluded.
- In-app appointment activity is informational and does not affect unread notification counts or provider delivery.

## Scope and limitations

This change makes lifecycle events visible in the patient's in-app history. It does not enable or simulate external delivery. WhatsApp, SMS, and email messages still require `NOTIFICATION_DELIVERY_ENABLED=true`, an enabled patient channel preference, a usable destination, and valid provider configuration. Appointment creation currently queues the existing 24-hour reminder when eligible; it does not send an immediate confirmation. Existing rescheduling and cancellation queues remain unchanged.

## Verification

Focused Jest tests cover patient scoping, creation/rescheduling/cancellation mapping, privacy, merged ordering, read-state behavior, and accurate provider acceptance labeling. The full Jest suite passed (115 suites, 895 tests); focused patient and app integration suites passed (14 suites, 140 tests). ESLint, repository-wide Prettier check, CSS build, and the patient dashboard Playwright/axe-core check passed.
