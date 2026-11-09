# Issue #381 — Preserve Verified Accounts During Email Changes

**Issue:** https://github.com/personalProjectsDeltaG8109/saludvital/issues/381  
**Branch:** `fix/381-email-reverification-lifecycle`  
**Status:** Implementation and verification complete; no commit, push, or pull request yet.

## Behavior

- An established, verified account keeps its current email and verification state while a replacement is pending.
- The verification link is sent to the replacement address. Confirming it promotes that address in a transaction and clears pending verification data.
- A replacement address already used as another account's current or pending address is rejected. A last-second uniqueness conflict is handled without replacing the current email.
- Changing an unverified registration's email updates that registration address and issues a fresh verification request.
- A replacement request uses its own timestamp for the existing 30-minute verification validity. The initial-registration cleanup remains based on account creation and ignores records with a pending replacement address.
- Patient self-service, administrator self-edits, and administrator edits of patient or doctor profiles use one shared queueing flow. Queued older links are invalidated; a request is rejected while its verification email is already being sent.
- Duplicate-address lookups stay non-locking to avoid deadlocks during concurrent registrations. Database uniqueness constraints remain the final protection, and reverification checks for conflicts again before promotion.
- The confirmation page identifies an email change separately from initial account confirmation. The email explains that the old address remains active until confirmation.

## Data and Schema

The existing user record did not retain a pending replacement address or the time it was requested. Added nullable `pending_email` and `email_verification_requested_at` columns, with a unique constraint on pending addresses. The migration is additive and reversible. No secret or verification token is stored in plaintext.

## Verification

- Focused Jest: 8 suites, 116 tests passed.
- Full Jest on the prepared `saludvital_test` database: 126 suites, 1,007 tests passed.
- Playwright and axe-core: `npm run test:e2e` passed.
- ESLint, CSS build, targeted Prettier verification for all story files, and `git diff --check` passed.
- Repository-wide `format:check` still reports a formatting issue in the unrelated `database/seeders/20261108120000-development-demo-environment.js`; that working-tree change was left untouched.

## Remaining Checks

- Review the final diff and commit the implementation locally.
- Push and open a pull request only after explicit authorization.
