# Issue #303 — Reduce Spacing Between Specialty Number and Name Columns

## Implementation

- Tightened the first specialty catalog column and reduced horizontal cell padding between the row number and specialty name.
- Rebalanced the remaining desktop column widths so the description, doctor count, status, and actions stay readable.
- Kept the responsive card layout for widths up to 1000 px unchanged.
- Added a browser assertion for the number-to-name gap at desktop width and retained overflow checks across mobile, tablet, and desktop sizes.

## Verification

- `npm run format` — passed; no unrelated formatting changes were produced.
- The repository's scoped Prettier write command — passed.
- `npm test -- --runInBand` — passed (113 suites, 866 tests).
- `npm run lint` — passed.
- `npm run css:build` — passed.
- `npm run format:check` — passed.
- `npm run test:e2e` — passed, including specialty layout, no-overflow, action-bound, and number-to-name spacing checks.
- `git diff --check` — passed.
