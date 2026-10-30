# US-ADM-50 — View Notification Details and Delivery Events

GitHub Issue: [#225](https://github.com/personalProjectsDeltaG8109/saludvital/issues/225)

## Existing Data

- Notifications persist the channel, recipient address, event type, application status, scheduled/created/updated/sent timestamps, attempt count, provider message reference, provider delivery status, last error, and optional appointment reference.
- Meta webhooks update the current provider delivery status and notification `updated_at`; the schema does not retain an immutable delivery-event or per-attempt timeline.
- Resend and Inalambria acceptance is represented by the existing `Sent` state and `sent_at`. It is not treated as confirmed delivery.

## Implementation

- Added an administrator-protected, read-only notification detail endpoint and a native responsive dialog opened by each list action.
- The detail query uses explicit projections and existing patient, appointment, and appointment-status associations. It excludes notification payloads, appointment reasons, patient document/contact fields, credentials, and raw errors.
- The dialog shows the event type, channel, patient name with masked destination, current application/provider states, a masked provider reference, available timestamps, attempt count, safe failure category, and an associated appointment summary when present.
- Timeline entries are built only from persisted creation, provider-acceptance, final provider-status, and application-failure/current-processing information. A visible note explains that immutable event history is not stored.
- Failure details reuse the existing safe WhatsApp error categorization and expose at most a numeric provider error code. All values are rendered with `textContent`.
- No schema, dependency, send, resend, delete, or state-changing operation was added.

## Limitations

The current database stores notification state snapshots rather than every delivery callback and retry as separate events. The view cannot reconstruct intermediate statuses or exact per-attempt times that were not persisted. It displays available timestamps and current status only.

## Verification

- Jest: notification detail, existing WhatsApp delivery, and application integration suites passed (3 suites, 91 tests).
- Playwright with axe-core: `node tests/e2e/admin-notifications.e2e.js` passed, including detail dialog rendering, literal text handling, focus restoration, existing notification filters, and responsive viewport checks from 320px to 1440px.
- ESLint: `npm run lint` passed.
- Prettier: `npm run format:check` passed.
- MySQL-backed detail lookup executed with an unused valid identifier and returned the expected not-found response; the joined query completed without a database error.
