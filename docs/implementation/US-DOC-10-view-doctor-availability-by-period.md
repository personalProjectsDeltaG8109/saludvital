# US-DOC-10 — View Doctor Availability by Day, Week, and Month

## Implementation

- Added three read-only availability cards to the protected doctor agenda: today, the selected week, and the selected month. Period navigation refreshes the summaries together with the agenda.
- Reused persisted `DoctorAvailability`, `DoctorScheduleException`, `Appointment`, and `AppointmentStatus` records. The summary is restricted to the doctor resolved from the authenticated user; no doctor ID is accepted from the browser.
- Capacity uses the application's configured appointment duration (30 minutes). Active weekly intervals and additional-availability exceptions form candidate intervals; unavailable exceptions are subtracted. Only complete 30-minute slots within the resulting intervals count toward capacity.
- A candidate slot is occupied when it overlaps a non-cancelled persisted appointment. The occupied-slot set counts each slot once. Available capacity is total usable slots minus occupied slots. Cancelled appointments do not occupy capacity.
- Each card can expand to show configured hours and exception labels by date, including full-day blocks. No appointment reason, patient identity, or other patient detail is included in the summary response.
- Each card displays its covered calendar date or inclusive date range. “Hoy” remains anchored to the current Bogota date, while the weekly and monthly cards follow the selected agenda date.
- Added explicit empty and error states. The cards contain no schedule editing or blocking controls.
- Reused the existing agenda route, models, schedule exception rules, and shared `APPOINTMENT_SLOT_MINUTES` configuration. No schema or dependency changes were needed.

## GitHub and branch

- Issue: [#209 — US-DOC-10](https://github.com/personalProjectsDeltaG8109/saludvital/issues/209)
- Branch: `feature/doc-agenda-availability`, created from updated `develop` at `05390bf`.

## Verification

- `npm test -- --runInBand`: all 83 Jest suites passed (624 tests).
- `npm run test:e2e`: passed, including all existing browser flows and the doctor agenda checks at mobile, tablet, and desktop viewports.
- `node tests/e2e/doctor-agenda.e2e.js`: passed at mobile, tablet, and desktop viewports, including accessibility checks.
- `npm run lint` and `npm run format:check`: passed.
- Pug compilation and `git diff --check`: passed.
- Capacity counts only complete 30-minute slots aligned to the application's slot grid; unit coverage includes schedule boundaries and exceptions.

## Responsive and selected-period follow-up

- Added visible date coverage to the read-only capacity cards so doctors can distinguish today's figures from the selected week and month.
- The selected-week card follows the agenda's selected date and displays the inclusive Monday-to-Sunday range; the month card displays the first through last calendar day.
- Unit tests verify that today remains anchored to the Bogota current date while week and month ranges follow a different selected date. Browser tests verify the displayed selected-week range and card content bounds at tablet widths.
- Follow-up tracked in [Issue #274](https://github.com/personalProjectsDeltaG8109/saludvital/issues/274).
- Verification: `npm test -- --runInBand` passed (113 suites, 858 tests); `npm run test:e2e` passed, including agenda responsive and axe-core checks; `npm run lint`, `npm run format:check`, `npm run format`, the repository's targeted Prettier write command, `npm run css:build`, and `git diff --check` passed.
