# US-AUTH-12 — Automatically Remove Unverified Patient Registrations

## Implementation

- Added a configurable cleanup period with a safe 30-minute default. `UNVERIFIED_REGISTRATION_RETENTION_MINUTES` accepts values from 30 minutes to one year.
- Added a bounded background scheduler that checks up to 50 expired registrations once per minute and advances through candidate IDs so preserved older accounts cannot starve later candidates.
- Cleanup rechecks account verification and age while holding database locks. It removes only Patient accounts that remain unverified and have no appointment, notification, conversation, audit, or other protected references.
- Verification outbox jobs are removed in the same transaction as the registration. Jobs currently being processed and non-verification jobs are preserved.
- Verification links expire 30 minutes after registration by default. The worker will not send a link after that retention deadline.
- No schema migration or dependency was required. Existing `users.created_at`, verification fields, and associations support the behavior.

## GitHub

- Issue: [#233 — US-AUTH-12](https://github.com/personalProjectsDeltaG8109/saludvital/issues/233)
- Branch: `feature/auth-unverified-registration-cleanup`

## Verification

- `npm.cmd test -- --runInBand`: passed, 97 suites and 728 tests.
- Focused MySQL integration suite against `saludvital_test`: passed, 2 tests.
- `npm.cmd run lint`: passed.
- Prettier check for modified JavaScript and Markdown files: passed.
- `npm.cmd run db:test:prepare`: passed; the dedicated test schema was already current and the initial roles seeder completed.
