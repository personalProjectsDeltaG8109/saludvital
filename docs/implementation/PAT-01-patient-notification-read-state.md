# PAT-01 — Patient Notification Read State

## Implementation

- Replaced the fixed patient header notification badge with a count of persisted notifications whose `read_at` value is null. The count is provided on all patient pages that render the shared top bar.
- Added nullable `notifications.read_at` with a reversible migration. Existing notification history is backfilled as already read using its persisted sent, scheduled, or creation timestamp.
- Opening the notification center marks the two initially visible history rows as read. Expanding the history marks the newly revealed rows as read through an authenticated patient endpoint.
- The endpoint validates a bounded list of positive unique IDs and scopes updates to the patient linked to the authenticated user. Repeated read requests are safe and do not alter delivery status.
- The history query selects only the fields needed to render notification labels, dates, channel, and status; notification payload and destination fields are excluded.
- The patient dashboard WhatsApp, SMS, and email controls are accessible switches backed by persisted preferences. They use a dedicated protected endpoint, update all appointment-event preferences for a channel in a transaction, and restore the prior switch state if validation or persistence fails.
- The dashboard continues to enforce the existing rule that at least one notification channel remains enabled.

## Verification

- `npm run db:test:prepare` — applied the pending migration to the dedicated `saludvital_test` database and seeded its required role records.
- `npm test -- --runInBand` — 101 suites and 754 tests passed.
- `node tests/e2e/patient-dashboard-notifications.e2e.js` — passed switch updates, rejected-update rollback, responsive widths, and axe-core.
- `npm run lint -- --no-warn-ignored` — passed.
- Prettier check for changed files — passed.
- `git diff --check` — passed.

## Limitations

- The app uses the existing notification center rather than a separate bell popover. Clicking the bell opens the center; reading occurs for rows shown there.
- The MySQL migration must be applied before deploying this code. Existing entries are marked read by design to avoid treating old history as newly received.
