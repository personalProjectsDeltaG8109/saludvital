# ISSUE-252 — Remove Unsupported Patient Appointment Location

## Scope

Remove clinic-location labels from the patient appointment list, appointment detail dialog, eligible reschedule list, and selected reschedule summary. Keep appointment scheduling behavior and persisted history unchanged.

## Data Review

- The appointment model and migrations do not define a clinic or location association.
- Patient appointment and reschedulable appointment queries do not select a location.
- Existing views displayed fallback labels such as “Sede SaludVital”; those values were not supported by persisted appointment data.
- No database migration or field deletion is needed. The demo preview fixtures no longer include unused site labels.

## Implementation

- Removed the unsupported location column and appointment-detail field from “Mis citas”.
- Removed location metadata and the summary row from the rescheduling interface.
- Updated mobile grid column mappings after removing the location cells.
- Improved contrast for affected rescheduling status and supporting text; labeled the appointment-selection table header for screen readers.
- Added unit and Playwright coverage for supported appointment details, removed location labels, responsive widths, and axe-core.
- Updated US-PAT-02 and US-PAT-03 acceptance criteria to prohibit displaying unpersisted location values.

## Verification

- `npm run format` — passed.
- `npx prettier --write ... --plugin @prettier/plugin-pug` — passed; targeted files were already formatted.
- `npm run test -- --runInBand` — passed: 106 suites, 783 tests.
- `npm run lint` — passed.
- `npm run css:build` — passed; generated CSS output was restored because this story does not change Tailwind input.
- `npm run format:check` — passed.
- `npm run test:e2e` — passed, including responsive widths of 375, 760, 768, 1024, and 1440px and axe-core on the rescheduling view.
- `git diff --check` — passed.
