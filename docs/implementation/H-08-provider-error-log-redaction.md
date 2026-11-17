# H-08 — Keep Provider Errors Safe

Issue: [#489](https://github.com/personalProjectsDeltaG8109/saludvital/issues/489)

## What changed

- Email and notification workers now log fixed error categories and validated HTTP status numbers instead of raw error messages.
- New notification failures store a safe category in `Notification.last_error`. The administrator view translates that category into a fixed Spanish explanation.
- Unexpected chatbot failures now receive a general Spanish response. Expected appointment rules still show their existing safe messages.
- The email outbox continues to retry failed jobs; notification retry decisions and delivery states are unchanged.
- Existing notification records keep their current display behavior. Their stored error text is not returned directly to administrators.

## Safe diagnostics

The application may record a fixed category (`provider_rejected`, `provider_temporary_failure`, `delivery_outcome_unknown`, or `unexpected_error`) and an HTTP status from 100 to 599. It does not record provider response bodies, credentials, recipient addresses, message contents, or raw exception messages in these worker logs or new notification failure records.

## Verification

- Synthetic token, email, and clinical markers are checked in worker logs, notification failure updates, and chatbot replies.
- Full Jest: 153 suites and 1,178 tests passed.
- Focused error/provider tests: 7 suites and 66 tests passed.
- ESLint and Prettier checks passed.
- No database migration or new dependency was needed.

Issue #489 remains open until the branch is reviewed and merged.
