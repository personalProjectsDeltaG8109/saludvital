# Issue #536 — Keep appointment choices matched to the latest selection

## Problem

When a patient quickly changes the specialty, doctor, appointment date, or appointment being rescheduled, an older request can finish after the latest request. Its response could replace or mix with the choices that belong to the current selection.

## What changed

- Booking requests now apply doctor and availability results only while the specialty, doctor, and date still match the selection that started the request.
- Rescheduling requests now apply available times and errors only while the appointment, doctor, and date still match the current selection.
- Changing a doctor or appointment clears choices that belonged to the previous selection.
- Added a browser test with delayed responses to confirm that earlier answers cannot overwrite current choices or the booking summary.
- No database change or new dependency was needed.

## Verification

- `npm run format` completed successfully.
- The repository's requested Prettier command completed successfully.
- Focused browser test: `node tests/e2e/patient-appointment-selection-race.e2e.js` passed for booking and rescheduling.
- Full Jest suite: 158 suites and 1,223 tests passed.
- `npm run lint` passed.
- `npm run css:build` passed. It produced no lasting CSS change because this issue does not modify styles.
- Full `npm run test:e2e` passed, including the new delayed-response test and existing accessibility checks.
- `git diff --check` passed.

## Work status

Implemented on `fix/536-patient-appointment-selection-race`, based on the latest `develop`. Pull request targets `develop`.
