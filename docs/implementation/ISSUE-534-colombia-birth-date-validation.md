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

- `npm run format` completed without changing files.
- The requested Prettier command completed without changing files.
- Focused Jest tests: 3 suites and 85 tests passed.
- Full Jest suite: 158 suites and 1,223 tests passed.
- ESLint passed.
- Tailwind CSS build passed.
- Playwright end-to-end suite passed, including the browser and accessibility flows.
- `git diff --check` passed.

## Work status

Implemented on `fix/534-colombia-birth-date-validation`. The changes are ready for review in a pull request targeting `develop`.
