# US-AUTH-11 â€” Protect Login Against Consecutive Failed Attempts

**GitHub Issue:** [#231](https://github.com/personalProjectsDeltaG8109/saludvital/issues/231)
**Branch:** `feature/auth-login-failed-attempt-lockout`

## User Story

As a registered SaludVital user, I want repeated incorrect password attempts to trigger a temporary login lock so that my account is protected from password guessing while successful sign-ins remain unaffected.

## Acceptance Criteria

- Count consecutive incorrect-password attempts for an existing account using persistent, concurrency-safe storage.
- Allow five consecutive failed password attempts; reject later login attempts for 15 minutes after the fifth failure.
- Expire the lock automatically after 15 minutes and reset the counter.
- Clear failed-attempt state only after a valid login session has been established. Logging out does not change it.
- Do not count malformed requests or valid passwords requiring email verification as incorrect-password attempts.
- Keep invalid-credential responses generic. Once a real account reaches the lock threshold, show the temporary lock and its remaining time; disable email, password, visibility-toggle, and submit controls until expiry. The server must continue rejecting attempts during the lock. This reveals that the submitted account identifier is registered after the threshold and is an accepted tradeoff for the requested clear lock feedback.
- Retain separate IP-based abuse protection without consuming its failed-attempt allowance on successful sign-ins.
- Update attempt state atomically and never store submitted passwords, password hashes in attempt records, or tokens.
- Preserve password verification, email verification, role redirects, secure sessions, and inactivity expiration.
- Add unit and HTTP tests for the threshold, lock expiry, successful-login reset, logout, unknown accounts, concurrent attempts, and generic errors.
- Add a reversible schema migration when persistent storage requires it.

## Implementation Notes

- Added `failed_login_attempts` and `login_locked_until` to the existing `users` table. Existing accounts begin with zero failures and no lock.
- Authentication looks up and locks the active user row inside a database transaction before checking or updating the counter. The fifth wrong password sets a 15-minute lock; the fifth failed password immediately returns the lock response with its expiry, and subsequent attempts remain rejected until that timestamp.
- Once a lock expires, the counter is cleared before the next password check. A correct password for an unverified account does not increase or clear the counter.
- The controller clears the lockout fields only after starting the authenticated session. If that persistence step fails, it removes the in-memory session and does not set the authentication cookie.
- The existing IP limiter remains separate and skips successful responses. It continues protecting repeated failed requests, including unknown account identifiers, and its 429 response renders the same disabled form with the limiter reset time. The login form countdown enables its controls when the server-provided expiry is reached.
- No passwords, password hashes in attempt records, tokens, or raw account data are logged or returned. The lock expiry is returned only to render the user-requested countdown; the locked email is not echoed.

## Verification

- `npm.cmd run db:test:prepare` â€” passed; applied the reversible lockout migration to the dedicated `saludvital_test` database and seeded roles.
- `npm.cmd test -- --runInBand` â€” passed: 93 suites and 704 tests.
- `npm.cmd run lint` â€” passed.
- `npm.cmd run format:check` â€” passed.
- `node tests/e2e/app.e2e.js` â€” passed responsive login and registration checks plus axe-core with no accessibility violations.

## Limitations

- A visible account-specific lock message can confirm that an email belongs to an account after five failed attempts. Invalid credentials remain generic before the threshold; use a separate IP limit and monitor this accepted account-enumeration tradeoff.

- The account-level counter and lock persist in MySQL and are serialized with a row lock. The separate IP limiter uses the existing in-memory `express-rate-limit` store, so its counts are local to each application process and reset on restart. A shared store would be needed if IP throttling must be coordinated across multiple application instances.
- An expired account lock is cleared when the next login attempt is processed; no background job is needed to unlock accounts at the expiry timestamp.
- The issue is not assigned to a milestone because no sprint was selected for this work.
