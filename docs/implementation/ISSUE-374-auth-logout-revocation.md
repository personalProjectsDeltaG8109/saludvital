# ISSUE-374 — Revoke the Persisted Session During Logout

- Related requirements: US-AUTH-04, US-AUTH-09, and the completed session-persistence work in [Issue #362](https://github.com/personalProjectsDeltaG8109/saludvital/issues/362).
- GitHub issue: [#374 — Revoke the persisted session during logout](https://github.com/personalProjectsDeltaG8109/saludvital/issues/374).
- The `/logout` route now resolves an optional authenticated session from the signed cookie before invoking the existing logout controller. Valid sessions provide the session ID that the controller revokes in `auth_sessions`.
- Missing, malformed, expired, or revoked cookies continue to the controller, which clears the cookie and redirects to `/login`. A valid logout deletes the persisted session before it reports success.
- Database errors during session resolution or revocation continue through Express error handling. The application does not redirect as if logout succeeded when revocation fails.
- Added a MySQL HTTP integration flow that creates verified users, logs in over HTTP, logs out, and replays the original cookie against protected dashboards for Patient, Doctor, and Administrator roles. Additional cases cover missing, malformed, and inactive session cookies.
- Added a controller unit regression for a failed session-revocation operation.
- No database schema, migration, dependency, or role policy change was required.

## Verification

- Baseline before the change: 3 focused auth suites, 26 tests passed.
- Final full Jest run: 123 suites and 982 tests passed.
- `npm run lint`: passed.
- `npm run format` and the required targeted Prettier write command: completed; files reported unchanged after formatting.
- `npm run format:check`: passed.
- `npm run css:build`: passed.
- `npm run test:e2e`: completed with exit code 0; all emitted browser-flow and accessibility checks reported PASS.
- The HTTP integration tests require and guard for the dedicated `saludvital_test` database.

## Workflow Status

- Feature branch: `feature/auth-logout-revocation-374`.
- Local commit: recorded after the final verification run.
- Push and pull request: pending explicit owner authorization, per the repository checklist workflow.
- Merge: not performed.
