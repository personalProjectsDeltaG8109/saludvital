# Issue #540 — Keep missed appointments out of Upcoming

## Problem

The patient's “Próximas” filter could include an appointment already marked “No Show” when the appointment date was today. This made a missed appointment look like a future appointment.

## What changed

- The server now excludes appointments marked `No Show` from the “Próximas” results.
- Missed appointments remain available in “No asistió” and “Todas”.
- The same filter is used for the result count and appointment page, so pagination stays consistent.
- Added service tests for the “Próximas” and “No asistió” filters.
- No database or interface change was needed.

## Verification

- `npm.cmd test -- --runInBand tests/unit/patientAppointmentListService.test.js` — passed: 1 suite, 6 tests.
- `node tests/e2e/patient-appointment-location.e2e.js` — passed, including responsive and accessibility checks for the patient appointment page.
- `npm.cmd run format` — passed; files were formatted.
- Requested Prettier write command — passed; target files were already formatted.
- `npm.cmd run test -- --runInBand` — passed: 158 suites, 1,225 tests.
- `npm.cmd run lint` — passed.
- `npm.cmd run format:check` — passed.
- `npm.cmd run css:build` — passed. The generated CSS was restored because this change does not modify styles.
- `npm.cmd run test:e2e` — passed, including patient appointment, responsive, and accessibility flows.
- `git diff --check` — passed.

## Work status

- Branch: `fix/540-patient-upcoming-no-show`, based on the updated `develop`.
- Pull request: [#541](https://github.com/personalProjectsDeltaG8109/saludvital/pull/541) targets `develop` and is open. GitHub CI run #637 passed.
