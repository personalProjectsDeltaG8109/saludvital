# Issue #391 — Prevent Duplicate Sends After Ambiguous Provider Outcomes

## Problem

The notification worker previously treated a database error while saving a successful provider response as a delivery failure. It could put the notification back in the queue and send the same message again. A worker restart could also reset an old `Processing` record to `Pending`, even though the provider might already have accepted it.

## Implementation

- Added the persisted `OutcomeUnknown` notification status and a guarded migration. The migration refuses rollback while unresolved records still use that status.
- Separated provider dispatch from persistence of the accepted result. A local save failure now attempts to record `OutcomeUnknown`; stale `Processing` jobs are also moved to that status instead of being resent automatically.
- Provider adapters classify transport failures and ambiguous HTTP outcomes separately from explicit rejections. Explicit retryable rejections retain the existing retry policy.
- Resend requests for persisted notifications use a stable `notification-{id}` idempotency key. Resend documents a 24-hour idempotency-key window; this does not provide a general exactly-once guarantee.
- Added safe Spanish status labels and an administrator filter for uncertain outcomes. No credentials or raw provider response bodies are exposed.
- Added unit coverage for ambiguous responses, persistence failure after acceptance, stale processing recovery, provider classification, status presentation, and migration rollback protection.
- Added a MySQL integration test that runs two workers while the first provider call is still pending. The dedicated test database confirms the notification is claimed and dispatched once, with one persisted attempt. Provider delivery remains mocked, so the test sends no external message.

## Provider Limitations

Meta and Inalambria requests do not currently have an application-level idempotency or reconciliation workflow in this project. Inalambria may provide job-status lookup when a job ID has been persisted, but this issue does not add a reconciliation operation. An uncertain result must be checked with the provider before any manual retry. The application does not claim exactly-once external delivery.

## Verification

- Focused notification worker tests: 2 suites, 10 tests passed, including the live MySQL concurrency test.
- Full Jest: 128 suites, 1,034 tests passed.
- ESLint passed. Prettier passed for changed files; repository-wide `format:check` remains blocked by the existing formatting of `database/seeders/20261108120000-development-demo-environment.js`.
- Tailwind CSS build passed. The generated `public/css/app.css` had no content diff.
- Playwright passed through patient dashboard notifications, but the full `test:e2e` command stopped when `patient-notification-history.e2e.js` tried to write a screenshot to the parent Desktop folder, outside the permitted workspace (`EPERM`). No provider messages were sent.
- The integration test uses the dedicated MySQL test database and a mocked provider. It verifies that while one worker is waiting on a provider response, a second worker cannot claim the same notification; only one dispatch and one attempt are persisted.

## References

- GitHub issue: [#391](https://github.com/personalProjectsDeltaG8109/saludvital/issues/391)
- [Resend idempotency keys](https://resend.com/changelog/idempotency-keys)
- [Inalambria Express API documentation](https://api.inalambria.express/docs/)
