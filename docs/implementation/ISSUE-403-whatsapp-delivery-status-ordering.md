# Issue 403 — Prevent WhatsApp Delivery Status Regression

## Implementation

- Moved Meta delivery callback persistence into `whatsappDeliveryStatusService` so timestamp parsing, transition checks, and database writes have separate responsibilities.
- Parse only valid Meta Unix-second timestamps. Callbacks with unknown statuses or invalid timestamps are ignored rather than ordered using the server's receipt time.
- Apply the supported transitions `sent → delivered → read` and `sent → failed`. `read` and `failed` are terminal for a single provider message ID. Older and duplicate callbacks cannot move a stored state backward.
- Lock the matching outbound message and WhatsApp notification rows and update both in one database transaction. If either update fails, the transaction rolls back and the webhook can be retried.
- Keep Meta's reported state separate from the application notification-processing status. Failure details remain limited to a numeric provider code or a fixed safe message.

## Schema

Added nullable callback-time columns through reversible migration `20261110140000-add-whatsapp-delivery-status-timestamps.js`:

- `whatsapp_messages.delivery_status_at`
- `notifications.provider_delivery_status_at`

Existing status rows are not assigned guessed timestamps. The transition rules still prevent a stored `read`, `failed`, or more advanced success state from regressing when its callback time is not yet known.

## Verification

Focused Jest verification passed: 4 suites and 19 tests covering callback ordering, duplicate delivery, safe failure details, transaction rollback, migration rollback, and webhook integration. The full Jest suite passed with 131 suites and 1,053 tests. ESLint, Prettier formatting, CSS build, and `git diff --check` passed. Tests use synthetic callbacks and mocked database records; no provider request is sent.
