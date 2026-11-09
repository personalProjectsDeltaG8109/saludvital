# Issue #387 — Separate Session Validation and Activity Refresh

**Issue:** https://github.com/personalProjectsDeltaG8109/saludvital/issues/387  
**Branch:** `fix/387-auth-session-activity-cleanup`

## Behavior

- Protected requests check the session owner and the existing 180-second inactivity window without changing `last_activity_at`.
- The existing `/session/activity` endpoint updates activity only after the browser reports an interaction. An expired session cannot be revived; the endpoint clears its cookie and returns `401` if the update no longer applies.
- Expired session rows are removed in batches of at most 100, once per minute. The query rechecks the expiry condition during deletion, so a session refreshed after selection is kept. Repeated and concurrent cleanup runs are safe.
- The scheduler starts with the application, stops during graceful shutdown, and is not started by test servers. No migration or dependency was needed.

## Verification

- Dedicated MySQL database preparation: `npm run db:test:prepare` passed for `saludvital_test`.
- Focused authentication unit and HTTP tests: 4 suites, 43 tests passed. After the final concurrent-request test update, the MySQL logout suite also passed separately: 1 suite, 8 tests.
- Full Jest: 126 suites, 1,019 tests passed with `--runInBand --testTimeout=30000`.
- ESLint, targeted Prettier, CSS build, and `git diff --check` passed.
- The full Playwright chain stopped at `patient-notification-history.e2e.js`: Windows denied its attempt to write preview screenshots to the parent Desktop path (`EPERM`). The preceding UI and accessibility checks passed, including axe-core.
- Repository-wide Prettier check reports an existing formatting issue in `database/seeders/20261108120000-development-demo-environment.js`; that file is not part of this issue.

## Limitations

- The Playwright screenshot destination and the unrelated seeder formatting issue remain outside this change. No live provider or production database was used.
