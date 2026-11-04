# Issue #301 — Prevent Specialty Catalog Row Overlap at Tablet Widths

## Implementation

- Reused the existing specialty catalog records, responsive row markup, and action controls; no API, database, or business-rule change was required.
- Switched the catalog to its existing card-style row structure at widths up to 1000 px, where the administrator sidebar leaves insufficient space for the six-column table.
- Allowed specialty names, descriptions, and row actions to wrap within their card without horizontal overflow.
- Extended browser coverage to 375, 768, 900, 1000, 1001, and 1440 px and checked row-cell overlap and action-control bounds.

## Verification

- `npm run format` — passed; no unrelated formatting changes were produced.
- The repository's scoped Prettier write command — passed.
- `npm test -- --runInBand` — passed (113 suites, 866 tests). An earlier run overlapped with E2E and briefly failed an unrelated email-outbox state assertion; the isolated test and a subsequent full serial run passed.
- `npm run lint` — passed.
- `npm run css:build` — passed.
- `npm run format:check` — passed.
- `npm run test:e2e` — passed, including specialty layout checks at 375, 768, 900, 1000, 1001, and 1440 px and available axe-core checks.
- `git diff --check` — passed.
