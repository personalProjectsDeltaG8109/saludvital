# Issue 407 — Refresh Doctor Notification Bell

## Problem

The doctor unread-count endpoint returned `{ unreadCount }`, while the shared sidebar poller updated its badge only when the response also included `success: true`. The doctor notification page performed a separate initial refresh, so the badge could look correct at first and then become stale during polling.

## Implementation

- Added `success: true` to the protected doctor unread-count response and kept the existing doctor-scoped count service.
- Made the doctor notification page use the same success check before applying a refreshed count.
- Extended the doctor browser test to run the shared sidebar poller, verify a count change from 1 to 2, and verify that a zero count removes the badge and resets its accessible label.
- Kept the existing individual-read, mark-all, authorization, and patient notification behavior covered.
- Updated patient notification E2E screenshots to write under ignored `test-results/`, keeping test artifacts inside the repository workspace.

## Verification

- Baseline before implementation: 2 Jest suites / 19 tests passed; doctor notification responsive and accessibility E2E passed.
- After implementation: 3 Jest suites / 99 tests passed, including doctor notification service, doctor route authorization, and shared application route checks.
- `tests/e2e/doctor-notifications.e2e.js` passed, including responsive and axe-core checks.
- `tests/e2e/patient-notification-history.e2e.js` passed, including responsive and axe-core checks.
- `npm run format` and the repository's targeted Prettier write command passed; no files changed during formatting.
- `npm test -- --runInBand` passed: 131 suites and 1,053 tests.
- `npm run lint`, `npm run format:check`, `npm run css:build`, and `npm run test:e2e` passed.
- `git diff --check` passed. The pre-existing local `public/css/app.css` file was backed up and restored around the CSS build, and was not included in the branch.
- Pull request #409 targets `develop`; GitHub Actions status could not be queried from this environment after creation.
