# Issue #574 - Show Upcoming Confirmed Appointments in WhatsApp

## Goal

When a patient chooses `Consultar citas`, show only appointments that are in the future and confirmed.

## Changes

- Added a patient-scoped query for future appointments with the `Confirmed` status.
- Sorted results by soonest appointment first and limited the response to ten records.
- Displayed the status in Spanish as `Confirmada` and added a clear empty message.
- Kept the appointment lookup used by cancellation unchanged.
- Rebased the work on the latest local `origin/develop`, including the merged appointment-date flow from PR #577.

## Verification

- Focused Jest run: 2 suites passed, 44 tests passed. This includes the existing appointment-date tests from PR #577.
- ESLint on the four changed JavaScript files: passed.
- Prettier check on the changed JavaScript files and this document: passed.
- No live WhatsApp message or database change was made.

## GitHub status

Issue #574 was reopened because this change has not reached `develop`; no pull request exists yet.

Branch: `feat/574-whatsapp-upcoming-confirmed`.
