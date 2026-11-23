# Issue #534 — Use Colombia's date for patient birth dates

## Problem

The registration form and the administrator patient form used the server's UTC date. In the evening in Colombia, UTC can already be on the next day, so the forms could accept tomorrow as a birth date.

## What changed

- Added one shared helper that returns today's date in Colombia.
- Updated patient registration and administrator patient editing to use that date.
- Kept the existing 120-year age limit and rejection of impossible dates.
- Added tests for the evening time difference, Colombia midnight, and leap-day dates.
- No database change was needed.

## Verification

- Focused Jest tests: 3 suites and 85 tests passed.
- Full Jest suite: 158 suites and 1,223 tests passed.
- ESLint passed.
- Prettier check passed for every changed source and test file.
- `git diff --check` passed.
- Playwright was not run because this change only affects server-side date validation.

## Work status

Implemented on `fix/534-colombia-birth-date-validation`. The changes are local and have not been pushed or opened as a pull request.
