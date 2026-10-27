# US-ADM-20 — View Weekly Doctor Availability

Issue: [#147](https://github.com/personalProjectsDeltaG8109/saludvital/issues/147)

Milestone: Sprint 5 - Administration (#6)

Branch: `feature/us-adm-20-view-weekly-doctor-availability`

## Acceptance criteria

- Only administrators can access the weekly availability endpoint.
- Administrators can select a doctor and view persisted schedule data by Monday-to-Sunday week in `America/Bogota`.
- The calendar displays active availability blocks, non-cancelled persisted appointments with their stored supported status, and persisted `Unavailable` exception periods with their reason.
- Doctor specialty, configured working days and hours, and the system-wide 30-minute appointment duration appear in the information panel.
- No patient details, invented time slots, break states, or unsupported availability states are shown.
- The view has understandable loading, empty, and error states, Spanish labels, keyboard-operable controls, and responsive layouts.

## Implementation notes

- Added a protected weekly schedule endpoint and a focused service that reads the existing doctor, availability, appointment, status, and exception models.
- Reused the current schedule page and doctor filter to select a doctor. The page adds a weekly timeline and schedule information panel; the shared appointment-duration constant is used for the informational duration.
- The appointment query selects only appointment ID, interval, and status; patient information is not queried.
- The exception model has no active flag. Stored `Unavailable` records are treated as effective under the existing booking rules; persisted `AdditionalAvailability` records are shown as additional available periods. Breaks are not represented in the schema and are not displayed.
- No schema or dependency changes were made.

## Verification

- `npm test -- --runInBand`: 52 suites passed, 431 tests passed.
- `npm run lint`: passed.
- `node tests/e2e/admin-doctor-schedules.e2e.js`: passed; weekly content, status/reason display, week navigation, and no horizontal overflow at 375×812, 768×1024, and 1440×900.
- Pug render smoke check: passed.

## Remaining work

No schedule creation, editing, or exception management was included. No merge, push, or pull request was performed.
