# Doctor Consultation Field Guidance and Limits

## Implementation

- Added a Spanish form note explaining required fields and that an incomplete consultation can be saved as a draft.
- Added concise help text for persisted text-field limits and linked each help message with `aria-describedby`.
- Kept the existing backend validation authoritative. No clinical requirements, workflow transitions, or persisted fields changed.
- Matched the order textarea to the backend maximum of 30 lines with up to 1,000 characters each, including the 29 line separators.
- Added view tests for labels and input constraints, plus service tests proving oversized values are rejected before opening a database transaction.
- No database migration or dependency change was needed.

## Verification

- `npm.cmd test -- --runInBand tests/unit/doctorConsultationStart.test.js tests/unit/doctorConsultationView.test.js` — passed: 2 suites, 37 tests.
- `npm.cmd test -- --runInBand` — passed: 110 suites, 833 tests.
- `npm.cmd run lint` — passed.
- `npm.cmd run format` and the requested Prettier write command — passed.
- `npm.cmd run format:check` — passed.
- `npm.cmd run css:build` — passed.
- `npm.cmd run test:e2e` — passed, including responsive and axe-core checks.
- `git diff --check` — passed.
