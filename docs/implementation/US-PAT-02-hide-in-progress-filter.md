# US-PAT-02 — Hide In-Progress Filter from Patient Appointments

## Implementation

- Reopened and updated GitHub Issue #45 to remove the dedicated `In Progress` filter and summary card from the patient appointment list.
- Kept persisted `In Progress` appointment records unchanged. They remain visible in the unfiltered list with the Spanish status label “En curso.”
- Removed the `In Progress` appointment summary metric and status-select option from “Mis citas.” The dashboard's next-appointment behavior is unchanged.
- No schema, migration, or dependency change was required.

## Verification

- `npm test -- --runInBand tests/unit/patientAppointmentsView.test.js` — passed, 2 tests.
- `npm test -- --runInBand` — passed, 103 suites and 771 tests.
- `npm run lint` — passed.
- `npm run format:check` — passed.
- `git diff --check` — passed.
- No browser end-to-end run was performed; the rendered Pug view is covered by the focused Jest test.
