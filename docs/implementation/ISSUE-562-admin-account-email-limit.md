# Issue #562 — Allow longer account emails in the administrator editor

## Problem

The account email limit is 320 characters, but the administrator forms for editing patient and doctor accounts stopped accepting text at 100 characters.

## What changed

- The patient and doctor account email fields now allow up to 320 characters.
- The server keeps validating email format and rejects values longer than 320 characters.
- Notification contact emails keep their existing separate limits.
- Existing email uniqueness and email confirmation behavior are unchanged.
- No database or dependency changes were needed.
- Added unit and browser checks for 100, 105, 320, and 321 character inputs.

## Verification

- `npm run format` passed.
- The repository Prettier write command passed without unrelated formatting changes.
- Focused Jest tests passed: 2 suites and 16 tests.
- Full Jest passed: 159 suites and 1,234 tests.
- `npm run lint` passed.
- `npm run format:check` passed.
- `npm run css:build` passed; generated CSS was restored because no style source changed.
- `npm run test:e2e` passed, including patient and doctor email editor checks.
- `git diff --check` passed.

## Work status

Implemented on `fix/562-admin-account-email-limit`, based on the latest `develop`. The pull request targets `develop`.
