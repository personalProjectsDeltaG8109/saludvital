# Issue #538 — Keep consultation details matched to the selected visit

## Problem

When a patient selected another consultation before an earlier detail request finished, the older response could replace the consultation shown on screen. A response could also refill the panel after it was closed.

## What changed

- Each consultation detail request now has a version. Only the latest request for the still-selected, visible consultation can display its result or error.
- Closing the detail invalidates any request still in progress, so a late response cannot reopen it.
- Added browser checks for out-of-order successful responses, an older failed request, closing while loading, and filtering while a request is pending.
- Kept the existing patient access checks, endpoint, and safe text rendering. No database change or dependency was needed.

## Verification

- `npm run format` — passed.
- Requested Prettier write command — passed; its target files were already formatted.
- `npm run test -- --runInBand` — passed: 158 suites and 1,223 tests.
- `npm run lint` — passed.
- `npm run format:check` — passed.
- `npm run css:build` — passed; the generated CSS was restored because this change does not modify styles.
- `node tests/e2e/patient-clinical-history.e2e.js` — passed, including delayed response cases, responsive sizes, and axe-core.
- `npm run test:e2e` — passed, including all patient, doctor, administrator, and accessibility browser checks.
- `git diff --check` — passed.

## Work status

Implemented on `fix/538-patient-clinical-detail-race`, based on the updated `develop`. Pull request targets `develop`.
