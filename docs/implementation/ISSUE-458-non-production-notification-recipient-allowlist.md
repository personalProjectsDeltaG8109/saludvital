# Issue 458 — Restrict Non-Production Notification Recipients

Issue: https://github.com/personalProjectsDeltaG8109/saludvital/issues/458
Branch: `fix/458-test-recipient-allowlist`
Status: Local implementation complete; awaiting owner authorization to push and open a pull request.

## Implemented

- Added `NOTIFICATION_TEST_RECIPIENTS`, a comma-separated allowlist for local provider tests and development delivery.
- Non-production workers require both `NOTIFICATION_DELIVERY_ENABLED=true` and at least one allowed destination. Their database query filters pending jobs to the allowlist, and a second check happens before a job is claimed. Other jobs stay pending and do not consume an attempt.
- The manual email, SMS, and WhatsApp test scripts reject destinations outside the same allowlist. They continue to refuse all sends in production.
- Production worker behavior remains governed by the existing delivery switch and is not limited by the test-only allowlist.
- Browser tests explicitly start with an empty allowlist, no provider credentials, and automatic delivery disabled.
- Documented the local setup in `.env.example` and `README.md`. No database, provider, or dependency changes were needed. No live provider message was sent.

## Verification

- Focused notification unit tests: 4 suites, 22 tests passed.
- MySQL worker concurrency and recipient-filter integration tests: 1 suite, 2 tests passed against `saludvital_test`.
- Full Jest suite: 143 suites and 1,117 tests passed.
- `npm run format`: passed.
- The repository's explicit Prettier write command: completed; listed files were unchanged.
- `npm run lint`: passed.
- `npm run format:check`: passed.
- `npm run css:build`: passed. The pre-existing local `public/css/app.css` content was restored byte-for-byte after the generated build.
- `npm run test:e2e`: passed with exit code 0, including the existing Playwright and axe-core flows.
- `git diff --check`: passed.

## Remaining Scope

This issue completes the non-production delivery safeguard in checklist H-05. The broader H-05 item remains partially open until the owner-approved demonstration-data policy is documented. Legal notice review and live provider validation remain separate pending work; no provider availability is claimed here.
