# US-ADM-47 — View Notification Dashboard and Summary Metrics

## Implementation

- Added the protected `/admin/notifications` dashboard and `/api/admin/notifications` endpoint. Both use the existing administrator authorization middleware.
- Reused persisted `Notification` records and the existing patient association. The dashboard supports the Email, WhatsApp, and SMS channels; “Sistema” remains unavailable because the schema has no persisted internal-notification channel.
- Added summary metrics and a paginated, searchable notification history with channel, status, and 7/30/90-day filters. Date ranges use inclusive `America/Bogota` calendar days and `created_at`.
- Metric rules distinguish application processing from provider delivery: **Total enviadas** counts non-cancelled records accepted by a provider; **Entregadas** counts only Meta `delivered` or `read`; **Fallidas** counts application failures or Meta `failed` once; **Pendientes** counts queued/processing records and accepted WhatsApp messages without a final provider status. These categories are not presented as a partition of one total.
- Resend and Inalambria currently provide application-level acceptance only. Meta delivery callbacks provide confirmed WhatsApp delivery states. “Aceptado por el proveedor” is not labeled as delivered. No historical percentage comparisons are shown because reliable comparison rules are not available.
- Recipient addresses are masked, raw message payloads and provider identifiers are excluded, and raw error details are replaced by fixed Spanish descriptions. Loading, empty, unavailable channel, and error states are included.
- No schema or dependency changes were required.

## Verification

- `npm.cmd test -- --runInBand tests/unit/adminNotificationDashboardService.test.js tests/integration/app.test.js` — passed: 2 suites, 77 tests.
- `npm.cmd test -- --runInBand` — passed: 88 suites, 665 tests.
- `node tests/e2e/admin-notifications.e2e.js` — passed: combined filters, pagination, empty/error states, keyboard-visible controls, Axe accessibility scan, and widths from 320 to 1440 pixels without horizontal overflow.
- `npm.cmd run lint` — passed.
- `npm.cmd run format:check` — passed.

## Limitations

- Internal system notifications are not stored as a separate channel in the current schema; the UI identifies that channel as unavailable instead of combining unrelated events.
- Only Meta currently supplies delivery callbacks. Resend and Inalambria acceptance is not treated as confirmed delivery, and no percentage comparisons are shown without a reliable historical baseline.
