# US-DOC-15 — View Doctor Appointment Notifications

## User Story

As an authenticated doctor, I want to see appointment changes relevant to my assigned appointments and track which updates I have read so that I can keep my schedule current.

## Acceptance Criteria

1. Only authenticated doctors can access their notification feed and unread count.
2. The feed is derived from persisted appointment history events and existing appointment assignments; it does not use fabricated notifications.
3. The feed includes only appointment creation, rescheduling, and cancellation events for appointments currently assigned to the authenticated doctor.
4. Each item shows a concise Spanish event label, appointment date and time when available, and event timestamp. It does not expose clinical notes, appointment reasons, patient contact details, credentials, or unrelated patient data.
5. The feed is ordered newest first with bounded server-side pagination.
6. Unread state is stored per doctor and per appointment history event. Reading an event does not modify appointment history or patient notification records.
7. Selecting a notification opens an accessible detail dialog with its persisted event type and available timestamps; untrusted content is rendered as text.
8. The doctor can mark one notification or all currently unread notifications as read. Repeated read requests are idempotent, and the unread count is refreshed after either operation.
9. Data access derives the doctor from the authenticated session and never accepts a client-provided doctor ID.
10. Invalid identifiers, unauthorized access, unavailable data, and database errors are handled safely.
11. The doctor top-bar bell links to the protected feed and displays the real unread count.
12. The responsive interface and controls are in Spanish and keyboard accessible.
13. New persistence is additive and reversible; no existing appointment, notification, or patient preference data is deleted or altered.
14. Automated tests cover doctor authorization, event selection, assignment scoping, ordering, pagination, unread counts, individual and bulk read updates, details, and privacy.

## Scope Notes

- Appointment events come from the existing `appointment_history` table.
- A separate per-doctor event-read record is needed because appointment history is immutable and existing notifications are patient-scoped.
- Only `Created`, `Rescheduled`, and `Cancelled` events are included. No new appointment events or patient-facing notifications are created.
- Events for appointments currently assigned to another doctor are not shown.
- Details show only the event label and timestamps already selected for the feed; patient identity, free-text history values, and clinical information remain excluded.
