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
- ESLint passed for changed JavaScript files; Prettier formatting passed.
- Changed-file ESLint, Prettier, and `git diff --check` passed.
- Full Jest, full Playwright, full lint, and CSS build checks are reserved for the pre-PR verification pass.
